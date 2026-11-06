const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../../models/Listing");
const Report = require("../../models/Report");
const Case = require("../../models/Case");
const AuditEvent = require("../../models/AuditEvent");
const Notification = require("../../models/Notification");
const Complaint = require("../../models/Complaint");
const { Order } = require("../../models/commerce");
const { readCaseDecision, readOrderCaseDecision } = require("../../domain/moderationRules");
const {
  readIdempotencyKey,
  fingerprint,
  assertSameFingerprint,
} = require("../../domain/idempotency");
const { orderWrite } = require("../../domain/orderWriteGate");
const { problem, validId } = require("../../domain/commerceRules");
const { applyAdminVisibility } = require("../../services/moderation");
const { requireAuth, requireAdmin } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");

router.post(
  "/admin/cases/:caseId/decisions",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!validId(req.params.caseId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    }
    const suppliedKey = req.get("Idempotency-Key");
    let response;
    try {
      response = await mongoose.connection.transaction(async (session) => {
        const caseRecord = await Case.findById(req.params.caseId).session(
          session,
        );
        if (!caseRecord)
          throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

        const isOrderCase =
          caseRecord.targetType === "ORDER" &&
          ["DELIVERY", "ITEM"].includes(caseRecord.type);
        const decision = isOrderCase
          ? readOrderCaseDecision(req.body)
          : readCaseDecision(req.body);
        if (!decision)
          throw problem(
            422,
            "VALIDATION_ERROR",
            "Quyết định xử lý không hợp lệ.",
          );
        const idempotencyKey =
          isOrderCase || suppliedKey ? readIdempotencyKey(req) : "";
        const fingerprintValue = idempotencyKey
          ? fingerprint({
              operation: "CASE_DECISION",
              caseId: String(caseRecord._id),
              decision,
            })
          : "";

        if (idempotencyKey) {
          const replay = caseRecord.decisions.find(
            (item) =>
              String(item.actorId) === String(req.user._id) &&
              item.idempotencyKey === idempotencyKey,
          );
          if (replay) {
            assertSameFingerprint(
              replay.idempotencyFingerprint,
              fingerprintValue,
            );
            return {
              result: {
                caseId: String(caseRecord._id),
                status: caseRecord.status,
                outcomeCode: caseRecord.outcomeCode,
                outcomeSummary: caseRecord.outcomeSummary,
              },
              reused: true,
            };
          }
        }

        if (
          decision.expectedVersion !== undefined &&
          caseRecord.version !== decision.expectedVersion
        ) {
          throw problem(
            409,
            "CASE_VERSION_CONFLICT",
            "Vụ việc vừa được cập nhật; hãy tải lại.",
          );
        }
        if (decision.status === "IN_REVIEW" && caseRecord.status !== "OPEN") {
          throw problem(
            409,
            "INVALID_STATE",
            "Chỉ vụ việc OPEN mới được chuyển sang IN_REVIEW.",
          );
        }
        if (decision.status === "CLOSED" && caseRecord.status !== "IN_REVIEW") {
          throw problem(
            409,
            "INVALID_STATE",
            "Chỉ vụ việc IN_REVIEW mới được đóng.",
          );
        }

        if (isOrderCase) {
          const order = await Order.findById(caseRecord.targetId).session(
            session,
          );
          if (!order)
            throw problem(404, "NOT_FOUND", "Không tìm thấy đơn liên quan.");
          const write = orderWrite(order, { _id: order._id }, {});
          const updated = await Order.updateOne(write.filter, write.update, {
            session,
          });
          if (updated.modifiedCount !== 1) {
            throw problem(
              409,
              "CASE_VERSION_CONFLICT",
              "Đơn hàng vừa được cập nhật; hãy tải lại.",
            );
          }
        }

        const fromStatus = caseRecord.status;
        if (decision.status === "IN_REVIEW") {
          caseRecord.status = "IN_REVIEW";
          caseRecord.decisions.push({
            actorId: req.user._id,
            fromStatus,
            toStatus: "IN_REVIEW",
            ...(idempotencyKey
              ? { idempotencyKey, idempotencyFingerprint: fingerprintValue }
              : {}),
          });
        } else {
          const listingAction = isOrderCase
            ? null
            : decision.outcomeCode === "CORRECTION_REQUIRED" ||
                decision.outcomeCode === "LISTING_HIDDEN"
              ? "HIDE"
              : decision.listingAction;
          if (listingAction) {
            const listing = await Listing.findById(caseRecord.targetId).session(
              session,
            );
            if (!listing)
              throw problem(404, "NOT_FOUND", "Không tìm thấy tin liên quan.");
            await applyAdminVisibility({
              listing,
              action: listingAction,
              reason: decision.outcomeCode,
              requireCorrection: decision.outcomeCode === "CORRECTION_REQUIRED",
              actorId: req.user._id,
              requestId: req.requestId,
              caseId: caseRecord._id,
              session,
            });
          }
          caseRecord.status = "CLOSED";
          caseRecord.outcomeCode = decision.outcomeCode;
          caseRecord.outcomeSummary = decision.outcomeSummary;
          caseRecord.closedAt = new Date();
          caseRecord.decisions.push({
            actorId: req.user._id,
            fromStatus,
            toStatus: "CLOSED",
            outcomeCode: decision.outcomeCode,
            outcomeSummary: decision.outcomeSummary,
            internalNote: decision.internalNote,
            ...(idempotencyKey
              ? { idempotencyKey, idempotencyFingerprint: fingerprintValue }
              : {}),
          });
        }
        caseRecord.version += 1;
        await caseRecord.save({ session });
        await AuditEvent.create(
          [
            {
              actorId: req.user._id,
              action:
                decision.status === "IN_REVIEW"
                  ? "CASE_REVIEW_STARTED"
                  : "CASE_CLOSED",
              targetType: "CASE",
              targetId: caseRecord._id,
              requestId: req.requestId,
              reason: decision.outcomeCode || "",
              fromState: fromStatus,
              toState: caseRecord.status,
              caseId: caseRecord._id,
            },
          ],
          { session },
        );

        if (decision.status === "CLOSED") {
          const reports = await Report.find({ caseId: caseRecord._id }).session(
            session,
          );
          const complaints = await Complaint.find({
            caseId: caseRecord._id,
          }).session(session);
          const recipients = new Map();
          for (const report of reports)
            recipients.set(String(report.reporterId), report.reporterId);
          for (const complaint of complaints)
            recipients.set(String(complaint.buyerId), complaint.buyerId);
          if (recipients.size) {
            await Notification.create(
              [...recipients.values()].map((recipientId) => ({
                recipientId,
                type: "CASE_CLOSED",
                ...(caseRecord.targetType === "LISTING"
                  ? { listingId: caseRecord.targetId }
                  : { orderId: caseRecord.targetId }),
                caseId: caseRecord._id,
                dedupeKey: `case-closed:${caseRecord._id}:${recipientId}`,
                message:
                  "Vụ việc của bạn đã được xử lý. Hãy mở trang khiếu nại để xem kết quả.",
              })),
              { session, ordered: true },
            );
          }
        }

        return {
          result: {
            caseId: String(caseRecord._id),
            status: caseRecord.status,
            version: caseRecord.version,
            outcomeCode: caseRecord.outcomeCode,
            outcomeSummary: caseRecord.outcomeSummary,
          },
          reused: false,
        };
      });
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(
          req,
          res,
          409,
          "CASE_VERSION_CONFLICT",
          "Vụ việc hoặc tin vừa được thay đổi; hãy tải lại.",
        );
      }
      throw error;
    }

    return success(req, res, response.result, 200, {
      idempotentReplay: response.reused,
    });
  },
);

module.exports = router;
