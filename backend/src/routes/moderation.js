const router = require("express").Router();
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const Listing = require("../models/Listing");
const Report = require("../models/Report");
const Case = require("../models/Case");
const Media = require("../models/Media");
const User = require("../models/User");
const AuditEvent = require("../models/AuditEvent");
const Notification = require("../models/Notification");
const { readListingReport, readCaseDecision } = require("../domain/moderationRules");
const { problem } = require("../domain/commerceRules");
const { applyAdminVisibility } = require("../services/moderation");
const {
  requireAuth,
  requireAdmin,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");

const reportLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => fail(req, res, 429, "RATE_LIMITED", "Bạn đã gửi quá nhiều báo cáo hôm nay."),
});

function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }
  return { page, limit };
}

function activeReportCaseFilter(listingId) {
  return {
    type: "REPORT",
    targetType: "LISTING",
    targetId: listingId,
    status: { $in: ["OPEN", "IN_REVIEW"] },
  };
}

async function createReport(req, input) {
  const persist = () => mongoose.connection.transaction(async (session) => {
    const listing = await Listing.findById(input.listingId).session(session);
    if (!listing) throw problem(404, "NOT_FOUND", "Không tìm thấy tin.");
    if (String(listing.ownerId) === String(req.user._id)) {
      throw problem(403, "FORBIDDEN", "Không thể báo cáo tin của chính mình.");
    }

    if (input.evidenceMediaIds.length) {
      const evidenceCount = await Media.countDocuments({
        _id: { $in: input.evidenceMediaIds },
        ownerId: req.user._id,
        purpose: "CASE_EVIDENCE",
      }).session(session);
      if (evidenceCount !== input.evidenceMediaIds.length) {
        throw problem(422, "VALIDATION_ERROR", "Bằng chứng phải là ảnh CASE_EVIDENCE do bạn tải lên.");
      }
    }

    let caseRecord = await Case.findOne(activeReportCaseFilter(listing._id)).session(session);
    if (!caseRecord) {
      [caseRecord] = await Case.create(
        [{ type: "REPORT", targetType: "LISTING", targetId: listing._id }],
        { session },
      );
    }

    const [report] = await Report.create(
      [{
        caseId: caseRecord._id,
        listingId: listing._id,
        reporterId: req.user._id,
        reasonCode: input.reasonCode,
        details: input.details,
        evidenceMediaIds: input.evidenceMediaIds,
      }],
      { session },
    );

    if (input.evidenceMediaIds.length) {
      await Case.updateOne(
        { _id: caseRecord._id },
        { $addToSet: { evidenceMediaIds: { $each: input.evidenceMediaIds } } },
        { session },
      );
    }
    await AuditEvent.create(
      [{
        actorId: req.user._id,
        action: "REPORT_CREATED",
        targetType: "REPORT",
        targetId: report._id,
        requestId: req.requestId,
        reason: input.reasonCode,
        fromState: "",
        toState: caseRecord.status,
        caseId: caseRecord._id,
      }],
      { session },
    );
    await Notification.create(
      [{
        recipientId: req.user._id,
        type: "REPORT_RECEIVED",
        listingId: listing._id,
        reportId: report._id,
        caseId: caseRecord._id,
        message: "Báo cáo tin của bạn đã được tiếp nhận.",
      }],
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
        throw problem(409, "CASE_CREATION_CONFLICT", "Vụ việc vừa được cập nhật; hãy gửi lại.");
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
    if (!input) return fail(req, res, 422, "VALIDATION_ERROR", "Dữ liệu báo cáo không hợp lệ.");

    const result = await createReport(req, input);
    return success(req, res, result, 201);
  },
);

router.get("/admin/cases", requireAuth, requireAdmin, async (req, res) => {
  const pageInfo = pagination(req.query);
  const status = req.query.status;
  if (
    !pageInfo ||
    (req.query.type !== undefined && req.query.type !== "REPORT") ||
    (status !== undefined && !["OPEN", "IN_REVIEW", "CLOSED"].includes(status)) ||
    Object.keys(req.query).some((key) => !["type", "status", "page", "limit"].includes(key))
  ) {
    return fail(req, res, 422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  }

  const [result] = await Case.aggregate([
    { $match: { type: "REPORT", ...(status ? { status } : {}) } },
    { $sort: { updatedAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (pageInfo.page - 1) * pageInfo.limit },
          { $limit: pageInfo.limit },
          {
            $lookup: {
              from: Report.collection.name,
              localField: "_id",
              foreignField: "caseId",
              as: "reports",
            },
          },
          {
            $project: {
              _id: 1,
              type: 1,
              targetType: 1,
              targetId: 1,
              status: 1,
              assignedSupportId: 1,
              outcomeCode: 1,
              outcomeSummary: 1,
              createdAt: 1,
              updatedAt: 1,
              reportCount: { $size: "$reports" },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  return success(req, res, result?.items || [], 200, {
    page: pageInfo.page,
    limit: pageInfo.limit,
    total: result?.total?.[0]?.count || 0,
  });
});

router.get("/admin/cases/:caseId", requireAuth, requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.caseId)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }

  const caseRecord = await Case.findOne({ _id: req.params.caseId, type: "REPORT" });
  if (!caseRecord) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");

  const [reports, listing, auditHistory] = await Promise.all([
    Report.find({ caseId: caseRecord._id })
      .sort({ createdAt: 1 })
      .populate("reporterId", "displayName")
      .lean(),
    Listing.findById(caseRecord.targetId),
    AuditEvent.find({ caseId: caseRecord._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("actorId action targetType targetId requestId reason fromState toState createdAt")
      .lean(),
  ]);
  const approvedVersion = listing?.versions.id(listing.approvedVersionId);

  return success(req, res, {
    case: caseRecord,
    listing: listing
      ? {
          listingId: String(listing._id),
          title: approvedVersion?.title || listing.versions.at(-1)?.title || "",
          ownerId: String(listing.ownerId),
          approvedVersionId: listing.approvedVersionId,
          reviewHold: listing.reviewHold,
          correctionRequested: listing.correctionRequested,
          sellerHidden: listing.sellerHidden,
          adminHidden: listing.adminHidden,
          saleStatus: listing.saleStatus,
        }
      : null,
    reports,
    auditHistory,
  });
});

router.post(
  "/admin/cases/:caseId/decisions",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.caseId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    }
    const decision = readCaseDecision(req.body);
    if (!decision) return fail(req, res, 422, "VALIDATION_ERROR", "Quyết định xử lý không hợp lệ.");

    let result;
    try {
      result = await mongoose.connection.transaction(async (session) => {
      const caseRecord = await Case.findOne({ _id: req.params.caseId, type: "REPORT" }).session(session);
      if (!caseRecord) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

      if (decision.status === "IN_REVIEW") {
        if (caseRecord.status !== "OPEN") {
          throw problem(409, "INVALID_STATE", "Chỉ vụ việc OPEN mới được chuyển sang IN_REVIEW.");
        }
        caseRecord.status = "IN_REVIEW";
        caseRecord.decisions.push({
          actorId: req.user._id,
          fromStatus: "OPEN",
          toStatus: "IN_REVIEW",
        });
        await caseRecord.save({ session });
        await AuditEvent.create(
          [{
            actorId: req.user._id,
            action: "CASE_REVIEW_STARTED",
            targetType: "CASE",
            targetId: caseRecord._id,
            requestId: req.requestId,
            fromState: "OPEN",
            toState: "IN_REVIEW",
            caseId: caseRecord._id,
          }],
          { session },
        );
        return { caseId: String(caseRecord._id), status: caseRecord.status };
      }

      if (caseRecord.status !== "IN_REVIEW") {
        throw problem(409, "INVALID_STATE", "Chỉ vụ việc IN_REVIEW mới được đóng.");
      }

      const listingAction = decision.outcomeCode === "CORRECTION_REQUIRED" ||
        decision.outcomeCode === "LISTING_HIDDEN"
        ? "HIDE"
        : decision.listingAction;
      if (listingAction) {
        const listing = await Listing.findById(caseRecord.targetId).session(session);
        if (!listing) throw problem(404, "NOT_FOUND", "Không tìm thấy tin liên quan.");
        await applyAdminVisibility({
          listing,
          action: listingAction,
          reason: decision.outcomeSummary,
          requireCorrection: decision.outcomeCode === "CORRECTION_REQUIRED",
          actorId: req.user._id,
          requestId: req.requestId,
          caseId: caseRecord._id,
          session,
        });
      }

      const fromStatus = caseRecord.status;
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
      });
      await caseRecord.save({ session });
      await AuditEvent.create(
        [{
          actorId: req.user._id,
          action: "CASE_CLOSED",
          targetType: "CASE",
          targetId: caseRecord._id,
          requestId: req.requestId,
          reason: decision.outcomeSummary,
          fromState: fromStatus,
          toState: "CLOSED",
          caseId: caseRecord._id,
        }],
        { session },
      );

      const reports = await Report.find({ caseId: caseRecord._id }).session(session);
      if (reports.length) {
        await Notification.create(
          reports.map((report) => ({
            recipientId: report.reporterId,
            type: "CASE_CLOSED",
            listingId: report.listingId,
            reportId: report._id,
            caseId: caseRecord._id,
            message: `Báo cáo của bạn đã được xử lý: ${decision.outcomeSummary}`,
          })),
          { session, ordered: true },
        );
      }

      return {
        caseId: String(caseRecord._id),
        status: caseRecord.status,
        outcomeCode: caseRecord.outcomeCode,
        outcomeSummary: caseRecord.outcomeSummary,
      };
      });
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(req, res, 409, "CONFLICT", "Vụ việc hoặc tin vừa được thay đổi; hãy tải lại.");
      }
      throw error;
    }

    return success(req, res, result);
  },
);

module.exports = router;
