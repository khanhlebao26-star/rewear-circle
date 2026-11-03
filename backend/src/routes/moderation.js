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
const Complaint = require("../models/Complaint");
const { Order, PaymentAttempt, CodCollection } = require("../models/commerce");
const {
  readListingReport,
  readCaseDecision,
  readAssignment,
  readOrderCaseDecision,
} = require("../domain/moderationRules");
const { readIdempotencyKey, fingerprint, assertSameFingerprint } = require("../domain/idempotency");
const { orderWrite } = require("../domain/orderWriteGate");
const { orderItemDTO } = require("../domain/orderDTO");
const { problem, validId } = require("../domain/commerceRules");
const { applyAdminVisibility } = require("../services/moderation");
const {
  requireAuth,
  requireAdmin,
  requireSupport,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");
const { supportCaseDetail, readContactAccess } = require("../services/caseAccess");

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

function readContactReason(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.reason !== "string") return null;
  const reason = body.reason.trim();
  if (
    reason.length < 10 || reason.length > 500 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(reason) ||
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(reason) ||
    /\+?\d[\d\s().-]{7,}\d/.test(reason)
  ) return null;
  return reason;
}

function activeReportCaseFilter(listingId) {
  return {
    type: "REPORT",
    targetType: "LISTING",
    targetId: listingId,
    status: { $in: ["OPEN", "IN_REVIEW"] },
  };
}

function adminCaseDTO(caseRecord) {
  return {
    caseId: String(caseRecord._id),
    type: caseRecord.type,
    targetType: caseRecord.targetType,
    targetId: String(caseRecord.targetId),
    status: caseRecord.status,
    version: caseRecord.version,
    assignedSupportId: caseRecord.assignedSupportId ? String(caseRecord.assignedSupportId) : null,
    outcomeCode: caseRecord.outcomeCode,
    outcomeSummary: caseRecord.outcomeSummary,
    contentRedacted: Boolean(caseRecord.contentRedacted),
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
    assignmentHistory: (caseRecord.assignmentHistory || []).map((assignment) => ({
      actorId: String(assignment.actorId),
      fromSupportId: assignment.fromSupportId ? String(assignment.fromSupportId) : null,
      assignedSupportId: assignment.assignedSupportId ? String(assignment.assignedSupportId) : null,
      createdAt: assignment.createdAt,
    })),
    decisions: (caseRecord.decisions || []).map((decision) => ({
      actorId: String(decision.actorId),
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
      outcomeCode: decision.outcomeCode,
      outcomeSummary: decision.outcomeSummary,
      internalNote: decision.internalNote,
      createdAt: decision.createdAt,
    })),
  };
}

function complaintDTO(complaint) {
  return {
    complaintId: String(complaint._id),
    caseId: String(complaint.caseId),
    orderId: String(complaint.orderId),
    buyerId: String(complaint.buyerId),
    sellerId: String(complaint.sellerId),
    type: complaint.type,
    reasonCode: complaint.reasonCode,
    details: complaint.details,
    contentRedacted: Boolean(complaint.contentRedacted),
    affectedOrderItemIds: (complaint.affectedOrderItemIds || []).map(String),
    itemSnapshots: (complaint.itemSnapshots || []).map(orderItemDTO),
    orderStatusAtSubmission: complaint.orderStatusAtSubmission,
    paymentMethod: complaint.paymentMethod,
    paymentStatusAtSubmission: complaint.paymentStatusAtSubmission,
    carrierNameAtSubmission: complaint.carrierNameAtSubmission,
    trackingCodeAtSubmission: complaint.trackingCodeAtSubmission,
    shippedAtSubmission: complaint.shippedAtSubmission,
    receivedAtSubmission: complaint.receivedAtSubmission,
    evidenceMediaIds: (complaint.evidenceMediaIds || []).map(String),
    createdAt: complaint.createdAt,
  };
}

function caseSummaryDTO(caseRecord) {
  return {
    caseId: String(caseRecord._id),
    type: caseRecord.type,
    targetType: caseRecord.targetType,
    targetId: String(caseRecord.targetId),
    status: caseRecord.status,
    version: caseRecord.version,
    assignedSupportId: caseRecord.assignedSupportId ? String(caseRecord.assignedSupportId) : null,
    outcomeCode: caseRecord.outcomeCode,
    outcomeSummary: caseRecord.outcomeSummary,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
  };
}

async function auditCaseDetailRead(req, caseRecord) {
  await AuditEvent.create({
    actorId: req.user._id,
    action: "CASE_DETAIL_READ",
    targetType: "CASE",
    targetId: caseRecord._id,
    caseId: caseRecord._id,
    requestId: req.requestId,
    fromState: caseRecord.status,
    toState: caseRecord.status,
  });
}

async function createReport(req, input) {
  const persist = () => mongoose.connection.transaction(async (session) => {
    const listing = await Listing.findById(input.listingId).session(session);
    if (!listing) throw problem(404, "NOT_FOUND", "Không tìm thấy tin.");
    if (String(listing.ownerId) === String(req.user._id)) {
      throw problem(403, "FORBIDDEN", "Không thể báo cáo tin của chính mình.");
    }

    let caseRecord = await Case.findOne(activeReportCaseFilter(listing._id)).session(session);
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
        throw problem(422, "VALIDATION_ERROR", "Bằng chứng phải thuộc bạn và chưa gắn với vụ việc khác.");
      }
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
  const type = req.query.type;
  const assignedSupportId = req.query.assignedSupportId;
  const unassigned = req.query.unassigned;
  if (
    !pageInfo ||
    (type !== undefined && !["REPORT", "DELIVERY", "ITEM"].includes(type)) ||
    (status !== undefined && !["OPEN", "IN_REVIEW", "CLOSED"].includes(status)) ||
    (assignedSupportId !== undefined && !validId(assignedSupportId)) ||
    (unassigned !== undefined && !["true", "false"].includes(unassigned)) ||
    (assignedSupportId !== undefined && unassigned === "true") ||
    Object.keys(req.query).some((key) => ![
      "type", "status", "assignedSupportId", "unassigned", "page", "limit",
    ].includes(key))
  ) {
    return fail(req, res, 422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  }

  const filter = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(assignedSupportId ? { assignedSupportId } : {}),
    ...(unassigned === "true" ? { assignedSupportId: null } : {}),
  };
  const [result] = await Case.aggregate([
    { $match: filter },
    { $sort: { updatedAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (pageInfo.page - 1) * pageInfo.limit },
          { $limit: pageInfo.limit },
          {
            $lookup: {
              from: Report.collection.name,
              let: { caseId: "$_id" },
              pipeline: [
                { $match: { $expr: { $eq: ["$caseId", "$$caseId"] } } },
                { $count: "count" },
              ],
              as: "reportCounts",
            },
          },
          {
            $lookup: {
              from: Complaint.collection.name,
              let: { caseId: "$_id" },
              pipeline: [
                { $match: { $expr: { $eq: ["$caseId", "$$caseId"] } } },
                { $count: "count" },
              ],
              as: "complaintCounts",
            },
          },
          {
            $project: {
              _id: 1,
              type: 1,
              targetType: 1,
              targetId: 1,
              status: 1,
              version: 1,
              assignedSupportId: 1,
              outcomeCode: 1,
              outcomeSummary: 1,
              createdAt: 1,
              updatedAt: 1,
              reportCount: { $ifNull: [{ $arrayElemAt: ["$reportCounts.count", 0] }, 0] },
              complaintCount: { $ifNull: [{ $arrayElemAt: ["$complaintCounts.count", 0] }, 0] },
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
  if (!validId(req.params.caseId)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }

  const caseRecord = await Case.findById(req.params.caseId);
  if (!caseRecord) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");

  if (caseRecord.type === "REPORT" && caseRecord.targetType === "LISTING") {
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
    await auditCaseDetailRead(req, caseRecord);
    res.set("Cache-Control", "private, no-store");

    return success(req, res, {
      case: adminCaseDTO(caseRecord),
      listing: listing
        ? {
            listingId: String(listing._id),
            title: approvedVersion?.title || listing.versions.at(-1)?.title || "",
            ownerId: String(listing.ownerId),
            approvedVersionId: listing.approvedVersionId ? String(listing.approvedVersionId) : null,
            reviewHold: listing.reviewHold,
            correctionRequested: listing.correctionRequested,
            sellerHidden: listing.sellerHidden,
            adminHidden: listing.adminHidden,
            saleStatus: listing.saleStatus,
          }
        : null,
      reports: reports.map((report) => ({
        reportId: String(report._id),
        caseId: String(report.caseId),
        listingId: String(report.listingId),
        reporter: report.reporterId ? {
          userId: String(report.reporterId._id),
          displayName: report.reporterId.displayName,
        } : null,
        reasonCode: report.reasonCode,
        details: report.details,
        contentRedacted: Boolean(report.contentRedacted),
        evidenceMediaIds: (report.evidenceMediaIds || []).map(String),
        createdAt: report.createdAt,
      })),
      auditHistory,
    });
  }

  if (["DELIVERY", "ITEM"].includes(caseRecord.type) && caseRecord.targetType === "ORDER") {
    const [order, complaints, auditHistory] = await Promise.all([
      Order.findOne({ _id: caseRecord.targetId }).select(
        "_id checkoutId buyerId sellerId items status paymentMethod paymentStatus currency subtotal shippingFee total carrierName trackingCode shippedAt receivedAt paymentReviewHold",
      ),
      Complaint.find({ caseId: caseRecord._id }).sort({ createdAt: 1 }),
      AuditEvent.find({ caseId: caseRecord._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .select("actorId action targetType targetId requestId reason fromState toState createdAt")
        .lean(),
    ]);
    if (!order) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");

    const [attempt, collection] = await Promise.all([
      order.paymentMethod === "VNPAY"
        ? PaymentAttempt.findOne({ checkoutId: order.checkoutId })
            .select("_id provider merchantReference status verifiedAt")
        : null,
      CodCollection.findOne({ orderId: order._id }).select("amount currency source recordedAt"),
    ]);
    await auditCaseDetailRead(req, caseRecord);
    res.set("Cache-Control", "private, no-store");

    return success(req, res, {
      case: adminCaseDTO(caseRecord),
      order: {
        orderId: String(order._id),
        buyerId: String(order.buyerId),
        sellerId: String(order.sellerId),
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        currency: order.currency,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
        paymentReviewHold: Boolean(order.paymentReviewHold),
        carrierName: order.carrierName,
        trackingCode: order.trackingCode,
        shippedAt: order.shippedAt,
        receivedAt: order.receivedAt,
        items: order.items.map(orderItemDTO),
        paymentReference: attempt ? {
          attemptId: String(attempt._id),
          provider: attempt.provider,
          merchantReference: attempt.merchantReference,
          status: attempt.status,
          verifiedAt: attempt.verifiedAt,
        } : null,
        codCollection: collection ? {
          amount: collection.amount,
          currency: collection.currency,
          source: collection.source,
          recordedAt: collection.recordedAt,
        } : null,
      },
      complaints: complaints.map(complaintDTO),
      auditHistory,
    });
  }

  return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
});

router.patch("/admin/cases/:caseId/assignment", requireAuth, requireAdmin, async (req, res) => {
  if (!validId(req.params.caseId)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }
  const assignment = readAssignment(req.body);
  if (!assignment) return fail(req, res, 422, "VALIDATION_ERROR", "Thông tin phân công không hợp lệ.");
  const idempotencyKey = readIdempotencyKey(req);
  const fingerprintValue = fingerprint({
    operation: "CASE_ASSIGNMENT",
    caseId: String(req.params.caseId),
    ...assignment,
  });

  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const caseRecord = await Case.findById(req.params.caseId).session(session);
      if (!caseRecord) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

      const replay = caseRecord.assignmentHistory.find((item) =>
        String(item.actorId) === String(req.user._id) && item.idempotencyKey === idempotencyKey,
      );
      if (replay) {
        assertSameFingerprint(replay.idempotencyFingerprint, fingerprintValue);
        return { case: caseSummaryDTO(caseRecord), reused: true };
      }
      if (caseRecord.status === "CLOSED") {
        throw problem(409, "CASE_NOT_ACTIVE", "Không thể phân công vụ việc đã đóng.");
      }
      if (caseRecord.version !== assignment.expectedVersion) {
        throw problem(409, "CASE_VERSION_CONFLICT", "Vụ việc vừa được cập nhật; hãy tải lại.");
      }

      const nextSupportId = assignment.assignedSupportId;
      if (nextSupportId) {
        const support = await User.findOne({ _id: nextSupportId, role: "SUPPORT" }).session(session);
        if (!support) throw problem(422, "VALIDATION_ERROR", "Người nhận phải là tài khoản Support đang hoạt động.");
      }
      const previousSupportId = caseRecord.assignedSupportId ? String(caseRecord.assignedSupportId) : null;
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
      await AuditEvent.create([{
        actorId: req.user._id,
        action: "CASE_ASSIGNED",
        targetType: "CASE",
        targetId: caseRecord._id,
        requestId: req.requestId,
        fromState: previousSupportId ? "ASSIGNED" : "UNASSIGNED",
        toState: nextSupportId ? "ASSIGNED" : "UNASSIGNED",
        caseId: caseRecord._id,
      }], { session });
      return { case: caseSummaryDTO(caseRecord), reused: false };
    });
    return success(req, res, result.case, 200, { idempotentReplay: result.reused });
  } catch (error) {
    if (error.name === "VersionError") {
      return fail(req, res, 409, "CASE_VERSION_CONFLICT", "Vụ việc vừa được cập nhật; hãy tải lại.");
    }
    throw error;
  }
});

router.post("/admin/cases/:caseId/decisions", requireAuth, requireAdmin, async (req, res) => {
  if (!validId(req.params.caseId)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }
  const suppliedKey = req.get("Idempotency-Key");
  let response;
  try {
    response = await mongoose.connection.transaction(async (session) => {
      const caseRecord = await Case.findById(req.params.caseId).session(session);
      if (!caseRecord) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

      const isOrderCase = caseRecord.targetType === "ORDER" && ["DELIVERY", "ITEM"].includes(caseRecord.type);
      const decision = isOrderCase ? readOrderCaseDecision(req.body) : readCaseDecision(req.body);
      if (!decision) throw problem(422, "VALIDATION_ERROR", "Quyết định xử lý không hợp lệ.");
      const idempotencyKey = isOrderCase || suppliedKey ? readIdempotencyKey(req) : "";
      const fingerprintValue = idempotencyKey
        ? fingerprint({
            operation: "CASE_DECISION",
            caseId: String(caseRecord._id),
            decision,
          })
        : "";

      if (idempotencyKey) {
        const replay = caseRecord.decisions.find((item) =>
          String(item.actorId) === String(req.user._id) && item.idempotencyKey === idempotencyKey,
        );
        if (replay) {
          assertSameFingerprint(replay.idempotencyFingerprint, fingerprintValue);
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

      if (decision.expectedVersion !== undefined && caseRecord.version !== decision.expectedVersion) {
        throw problem(409, "CASE_VERSION_CONFLICT", "Vụ việc vừa được cập nhật; hãy tải lại.");
      }
      if (decision.status === "IN_REVIEW" && caseRecord.status !== "OPEN") {
        throw problem(409, "INVALID_STATE", "Chỉ vụ việc OPEN mới được chuyển sang IN_REVIEW.");
      }
      if (decision.status === "CLOSED" && caseRecord.status !== "IN_REVIEW") {
        throw problem(409, "INVALID_STATE", "Chỉ vụ việc IN_REVIEW mới được đóng.");
      }

      if (isOrderCase) {
        const order = await Order.findById(caseRecord.targetId).session(session);
        if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn liên quan.");
        const write = orderWrite(order, { _id: order._id }, {});
        const updated = await Order.updateOne(write.filter, write.update, { session });
        if (updated.modifiedCount !== 1) {
          throw problem(409, "CASE_VERSION_CONFLICT", "Đơn hàng vừa được cập nhật; hãy tải lại.");
        }
      }

      const fromStatus = caseRecord.status;
      if (decision.status === "IN_REVIEW") {
        caseRecord.status = "IN_REVIEW";
        caseRecord.decisions.push({
          actorId: req.user._id,
          fromStatus,
          toStatus: "IN_REVIEW",
          ...(idempotencyKey ? { idempotencyKey, idempotencyFingerprint: fingerprintValue } : {}),
        });
      } else {
        const listingAction = isOrderCase ? null :
          decision.outcomeCode === "CORRECTION_REQUIRED" || decision.outcomeCode === "LISTING_HIDDEN"
            ? "HIDE"
            : decision.listingAction;
        if (listingAction) {
          const listing = await Listing.findById(caseRecord.targetId).session(session);
          if (!listing) throw problem(404, "NOT_FOUND", "Không tìm thấy tin liên quan.");
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
          ...(idempotencyKey ? { idempotencyKey, idempotencyFingerprint: fingerprintValue } : {}),
        });
      }
      caseRecord.version += 1;
      await caseRecord.save({ session });
      await AuditEvent.create([{
        actorId: req.user._id,
        action: decision.status === "IN_REVIEW" ? "CASE_REVIEW_STARTED" : "CASE_CLOSED",
        targetType: "CASE",
        targetId: caseRecord._id,
        requestId: req.requestId,
        reason: decision.outcomeCode || "",
        fromState: fromStatus,
        toState: caseRecord.status,
        caseId: caseRecord._id,
      }], { session });

      if (decision.status === "CLOSED") {
        const reports = await Report.find({ caseId: caseRecord._id }).session(session);
        const complaints = await Complaint.find({ caseId: caseRecord._id }).session(session);
        const recipients = new Map();
        for (const report of reports) recipients.set(String(report.reporterId), report.reporterId);
        for (const complaint of complaints) recipients.set(String(complaint.buyerId), complaint.buyerId);
        if (recipients.size) {
          await Notification.create([...recipients.values()].map((recipientId) => ({
            recipientId,
            type: "CASE_CLOSED",
            ...(caseRecord.targetType === "LISTING"
              ? { listingId: caseRecord.targetId }
              : { orderId: caseRecord.targetId }),
            caseId: caseRecord._id,
            dedupeKey: `case-closed:${caseRecord._id}:${recipientId}`,
            message: "Vụ việc của bạn đã được xử lý. Hãy mở trang khiếu nại để xem kết quả.",
          })), { session, ordered: true });
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
      return fail(req, res, 409, "CASE_VERSION_CONFLICT", "Vụ việc hoặc tin vừa được thay đổi; hãy tải lại.");
    }
    throw error;
  }

  return success(req, res, response.result, 200, { idempotentReplay: response.reused });
});

router.get("/support/cases", requireAuth, requireSupport, async (req, res) => {
  const pageInfo = pagination(req.query);
  const type = req.query.type;
  const status = req.query.status;
  if (
    !pageInfo ||
    Object.keys(req.query).some((key) => !["type", "status", "page", "limit"].includes(key)) ||
    (type !== undefined && !["REPORT", "DELIVERY", "ITEM"].includes(type)) ||
    (status !== undefined && !["OPEN", "IN_REVIEW"].includes(status))
  ) {
    return fail(req, res, 422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  }
  const filter = {
    assignedSupportId: req.user._id,
    status: status || { $in: ["OPEN", "IN_REVIEW"] },
    ...(type ? { type } : {}),
  };
  const cases = await Case.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .skip((pageInfo.page - 1) * pageInfo.limit)
    .limit(pageInfo.limit)
    .select("type targetType targetId status version assignedSupportId createdAt updatedAt closedAt outcomeCode outcomeSummary")
    .lean();
  const total = await Case.countDocuments(filter);
  const caseIds = cases.map((caseRecord) => caseRecord._id);
  const [reportCounts, complaintCounts] = caseIds.length
    ? await Promise.all([
        Report.aggregate([
          { $match: { caseId: { $in: caseIds } } },
          { $group: { _id: "$caseId", count: { $sum: 1 } } },
        ]),
        Complaint.aggregate([
          { $match: { caseId: { $in: caseIds } } },
          { $group: { _id: "$caseId", count: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const reportCountByCase = new Map(reportCounts.map((record) => [String(record._id), record.count]));
  const complaintCountByCase = new Map(complaintCounts.map((record) => [String(record._id), record.count]));
  res.set("Cache-Control", "private, no-store");
  return success(req, res, cases.map((caseRecord) => ({
    caseId: String(caseRecord._id),
    type: caseRecord.type,
    targetType: caseRecord.targetType,
    targetId: String(caseRecord.targetId),
    status: caseRecord.status,
    version: caseRecord.version,
    assignedSupportId: String(caseRecord.assignedSupportId),
    reportCount: reportCountByCase.get(String(caseRecord._id)) || 0,
    complaintCount: complaintCountByCase.get(String(caseRecord._id)) || 0,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
    outcomeCode: caseRecord.outcomeCode,
    outcomeSummary: caseRecord.outcomeSummary,
  })), 200, { page: pageInfo.page, limit: pageInfo.limit, total });
});

router.get("/support/cases/:caseId", requireAuth, requireSupport, async (req, res) => {
  if (!validId(req.params.caseId)) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  const data = await supportCaseDetail({
    caseId: req.params.caseId,
    userId: req.user._id,
    requestId: req.requestId,
  });
  res.set("Cache-Control", "private, no-store");
  return success(req, res, data);
});

router.post("/support/cases/:caseId/contact-access", requireAuth, requireSupport, async (req, res) => {
  if (!validId(req.params.caseId)) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  const reason = readContactReason(req.body);
  if (!reason) return fail(req, res, 422, "VALIDATION_ERROR", "Lý do truy cập không hợp lệ.");
  const data = await readContactAccess({
    caseId: req.params.caseId,
    userId: req.user._id,
    role: "SUPPORT",
    reason,
    requestId: req.requestId,
  });
  res.set("Cache-Control", "private, no-store");
  return success(req, res, data);
});

router.post("/admin/cases/:caseId/contact-access", requireAuth, requireAdmin, async (req, res) => {
  if (!validId(req.params.caseId)) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  const reason = readContactReason(req.body);
  if (!reason) return fail(req, res, 422, "VALIDATION_ERROR", "Lý do truy cập không hợp lệ.");
  const data = await readContactAccess({
    caseId: req.params.caseId,
    userId: req.user._id,
    role: "ADMIN",
    reason,
    requestId: req.requestId,
  });
  res.set("Cache-Control", "private, no-store");
  return success(req, res, data);
});

module.exports = router;
