const router = require("express").Router();
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const Listing = require("../../models/Listing");
const Report = require("../../models/Report");
const Case = require("../../models/Case");
const Media = require("../../models/Media");
const AuditEvent = require("../../models/AuditEvent");
const Notification = require("../../models/Notification");
const { readListingReport } = require("../../domain/moderationRules");
const { problem } = require("../../domain/commerceRules");
const { requireAuth, requireVerifiedEmail } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");

const reportLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) =>
    fail(
      req,
      res,
      429,
      "RATE_LIMITED",
      "Bạn đã gửi quá nhiều báo cáo hôm nay.",
    ),
});

function activeReportCaseFilter(listingId) {
  return {
    type: "REPORT",
    targetType: "LISTING",
    targetId: listingId,
    status: { $in: ["OPEN", "IN_REVIEW"] },
  };
}

async function createReport(req, input) {
  const persist = () =>
    mongoose.connection.transaction(async (session) => {
      const listing = await Listing.findById(input.listingId).session(session);
      if (!listing) throw problem(404, "NOT_FOUND", "Không tìm thấy tin.");
      if (String(listing.ownerId) === String(req.user._id)) {
        throw problem(
          403,
          "FORBIDDEN",
          "Không thể báo cáo tin của chính mình.",
        );
      }

      let caseRecord = await Case.findOne(
        activeReportCaseFilter(listing._id),
      ).session(session);
      if (!caseRecord) {
        [caseRecord] = await Case.create(
          [{ type: "REPORT", targetType: "LISTING", targetId: listing._id }],
          { session },
        );
      }

      if (input.evidenceMediaIds.length) {
        const binding = await Media.updateMany(
          {
            _id: { $in: input.evidenceMediaIds },
            ownerId: req.user._id,
            purpose: "CASE_EVIDENCE",
            $or: [{ caseId: null }, { caseId: caseRecord._id }],
          },
          { $set: { caseId: caseRecord._id } },
          { session },
        );
        if (binding.matchedCount !== input.evidenceMediaIds.length) {
          throw problem(
            422,
            "VALIDATION_ERROR",
            "Bằng chứng phải thuộc bạn và chưa gắn với vụ việc khác.",
          );
        }
      }

      const [report] = await Report.create(
        [
          {
            caseId: caseRecord._id,
            listingId: listing._id,
            reporterId: req.user._id,
            reasonCode: input.reasonCode,
            details: input.details,
            evidenceMediaIds: input.evidenceMediaIds,
          },
        ],
        { session },
      );

      if (input.evidenceMediaIds.length) {
        caseRecord.evidenceMediaIds.addToSet(...input.evidenceMediaIds);
      }

      // Every report must conflict with concurrent Case closure, even without evidence.
      caseRecord.version += 1;
      await caseRecord.save({ session });

      await AuditEvent.create(
        [
          {
            actorId: req.user._id,
            action: "REPORT_CREATED",
            targetType: "REPORT",
            targetId: report._id,
            requestId: req.requestId,
            reason: input.reasonCode,
            fromState: "",
            toState: caseRecord.status,
            caseId: caseRecord._id,
          },
        ],
        { session },
      );
      await Notification.create(
        [
          {
            recipientId: req.user._id,
            type: "REPORT_RECEIVED",
            listingId: listing._id,
            reportId: report._id,
            caseId: caseRecord._id,
            message: "Báo cáo tin của bạn đã được tiếp nhận.",
          },
        ],
        { session },
      );

      return {
        reportId: String(report._id),
        caseId: String(caseRecord._id),
        status: caseRecord.status,
        receivedAt: report.createdAt,
      };
    });

  try {
    return await persist();
  } catch (error) {
    // A concurrent report may create the active Case first; retry and attach to it.
    if (error.code !== 11000 && error.name !== "VersionError") throw error;
    try {
      return await persist();
    } catch (retryError) {
      if (retryError.code === 11000 || retryError.name === "VersionError") {
        throw problem(
          409,
          "CASE_CREATION_CONFLICT",
          "Vụ việc vừa được cập nhật; hãy gửi lại.",
        );
      }
      throw retryError;
    }
  }
}

router.post(
  "/reports/listings",
  requireAuth,
  requireVerifiedEmail,
  reportLimit,
  async (req, res) => {
    const input = readListingReport(req.body);
    if (!input)
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Dữ liệu báo cáo không hợp lệ.",
      );

    const result = await createReport(req, input);
    return success(req, res, result, 201);
  },
);

module.exports = router;
