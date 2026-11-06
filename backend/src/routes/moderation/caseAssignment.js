const router = require("express").Router();
const mongoose = require("mongoose");
const Case = require("../../models/Case");
const User = require("../../models/User");
const AuditEvent = require("../../models/AuditEvent");
const { readAssignment } = require("../../domain/moderationRules");
const {
  readIdempotencyKey,
  fingerprint,
  assertSameFingerprint,
} = require("../../domain/idempotency");
const { problem, validId } = require("../../domain/commerceRules");
const { requireAuth, requireAdmin } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");

function caseSummaryDTO(caseRecord) {
  return {
    caseId: String(caseRecord._id),
    type: caseRecord.type,
    targetType: caseRecord.targetType,
    targetId: String(caseRecord.targetId),
    status: caseRecord.status,
    version: caseRecord.version,
    assignedSupportId: caseRecord.assignedSupportId
      ? String(caseRecord.assignedSupportId)
      : null,
    outcomeCode: caseRecord.outcomeCode,
    outcomeSummary: caseRecord.outcomeSummary,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
  };
}

router.patch(
  "/admin/cases/:caseId/assignment",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!validId(req.params.caseId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    }
    const assignment = readAssignment(req.body);
    if (!assignment)
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Thông tin phân công không hợp lệ.",
      );
    const idempotencyKey = readIdempotencyKey(req);
    const fingerprintValue = fingerprint({
      operation: "CASE_ASSIGNMENT",
      caseId: String(req.params.caseId),
      ...assignment,
    });

    try {
      const result = await mongoose.connection.transaction(async (session) => {
        const caseRecord = await Case.findById(req.params.caseId).session(
          session,
        );
        if (!caseRecord)
          throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

        const replay = caseRecord.assignmentHistory.find(
          (item) =>
            String(item.actorId) === String(req.user._id) &&
            item.idempotencyKey === idempotencyKey,
        );
        if (replay) {
          assertSameFingerprint(
            replay.idempotencyFingerprint,
            fingerprintValue,
          );
          return { case: caseSummaryDTO(caseRecord), reused: true };
        }
        if (caseRecord.status === "CLOSED") {
          throw problem(
            409,
            "CASE_NOT_ACTIVE",
            "Không thể phân công vụ việc đã đóng.",
          );
        }
        if (caseRecord.version !== assignment.expectedVersion) {
          throw problem(
            409,
            "CASE_VERSION_CONFLICT",
            "Vụ việc vừa được cập nhật; hãy tải lại.",
          );
        }

        const nextSupportId = assignment.assignedSupportId;
        if (nextSupportId) {
          const support = await User.findOne({
            _id: nextSupportId,
            role: "SUPPORT",
          }).session(session);
          if (!support)
            throw problem(
              422,
              "VALIDATION_ERROR",
              "Người nhận phải là tài khoản Support đang hoạt động.",
            );
        }
        const previousSupportId = caseRecord.assignedSupportId
          ? String(caseRecord.assignedSupportId)
          : null;
        if (previousSupportId === nextSupportId) {
          return { case: caseSummaryDTO(caseRecord), reused: false };
        }

        caseRecord.assignedSupportId = nextSupportId;
        caseRecord.assignmentHistory.push({
          actorId: req.user._id,
          fromSupportId: previousSupportId,
          assignedSupportId: nextSupportId,
          idempotencyKey,
          idempotencyFingerprint: fingerprintValue,
          requestId: req.requestId,
        });
        caseRecord.version += 1;
        await caseRecord.save({ session });
        await AuditEvent.create(
          [
            {
              actorId: req.user._id,
              action: "CASE_ASSIGNED",
              targetType: "CASE",
              targetId: caseRecord._id,
              requestId: req.requestId,
              fromState: previousSupportId ? "ASSIGNED" : "UNASSIGNED",
              toState: nextSupportId ? "ASSIGNED" : "UNASSIGNED",
              caseId: caseRecord._id,
            },
          ],
          { session },
        );
        return { case: caseSummaryDTO(caseRecord), reused: false };
      });
      return success(req, res, result.case, 200, {
        idempotentReplay: result.reused,
      });
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(
          req,
          res,
          409,
          "CASE_VERSION_CONFLICT",
          "Vụ việc vừa được cập nhật; hãy tải lại.",
        );
      }
      throw error;
    }
  },
);

module.exports = router;
