const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../../models/Listing");
const Report = require("../../models/Report");
const Case = require("../../models/Case");
const AuditEvent = require("../../models/AuditEvent");
const Complaint = require("../../models/Complaint");
const { Order, PaymentAttempt, CodCollection } = require("../../models/commerce");
const { orderItemDTO } = require("../../domain/orderDTO");
const { validId } = require("../../domain/commerceRules");
const { requireAuth, requireAdmin } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");
const { readPagination: pagination } = require("../../http/readPagination");

function adminCaseDTO(caseRecord) {
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
    contentRedacted: Boolean(caseRecord.contentRedacted),
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
    assignmentHistory: (caseRecord.assignmentHistory || []).map(
      (assignment) => ({
        actorId: String(assignment.actorId),
        fromSupportId: assignment.fromSupportId
          ? String(assignment.fromSupportId)
          : null,
        assignedSupportId: assignment.assignedSupportId
          ? String(assignment.assignedSupportId)
          : null,
        createdAt: assignment.createdAt,
      }),
    ),
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

router.get("/admin/cases", requireAuth, requireAdmin, async (req, res) => {
  const pageInfo = pagination(req.query);
  const status = req.query.status;
  const type = req.query.type;
  const assignedSupportId = req.query.assignedSupportId;
  const unassigned = req.query.unassigned;
  if (
    !pageInfo ||
    (type !== undefined && !["REPORT", "DELIVERY", "ITEM"].includes(type)) ||
    (status !== undefined &&
      !["OPEN", "IN_REVIEW", "CLOSED"].includes(status)) ||
    (assignedSupportId !== undefined && !validId(assignedSupportId)) ||
    (unassigned !== undefined && !["true", "false"].includes(unassigned)) ||
    (assignedSupportId !== undefined && unassigned === "true") ||
    Object.keys(req.query).some(
      (key) =>
        ![
          "type",
          "status",
          "assignedSupportId",
          "unassigned",
          "page",
          "limit",
        ].includes(key),
    )
  ) {
    return fail(
      req,
      res,
      422,
      "VALIDATION_ERROR",
      "Bộ lọc hoặc phân trang không hợp lệ.",
    );
  }

  const filter = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(assignedSupportId
      ? { assignedSupportId: new mongoose.Types.ObjectId(assignedSupportId) }
      : {}),
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
              reportCount: {
                $ifNull: [{ $arrayElemAt: ["$reportCounts.count", 0] }, 0],
              },
              complaintCount: {
                $ifNull: [{ $arrayElemAt: ["$complaintCounts.count", 0] }, 0],
              },
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

router.get(
  "/admin/cases/:caseId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!validId(req.params.caseId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    }

    const caseRecord = await Case.findById(req.params.caseId);
    if (!caseRecord)
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");

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
          .select(
            "actorId action targetType targetId requestId reason fromState toState createdAt",
          )
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
              title:
                approvedVersion?.title || listing.versions.at(-1)?.title || "",
              ownerId: String(listing.ownerId),
              approvedVersionId: listing.approvedVersionId
                ? String(listing.approvedVersionId)
                : null,
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
          reporter: report.reporterId
            ? {
                userId: String(report.reporterId._id),
                displayName: report.reporterId.displayName,
              }
            : null,
          reasonCode: report.reasonCode,
          details: report.details,
          contentRedacted: Boolean(report.contentRedacted),
          evidenceMediaIds: (report.evidenceMediaIds || []).map(String),
          createdAt: report.createdAt,
        })),
        auditHistory,
      });
    }

    if (
      ["DELIVERY", "ITEM"].includes(caseRecord.type) &&
      caseRecord.targetType === "ORDER"
    ) {
      const [order, complaints, auditHistory] = await Promise.all([
        Order.findOne({ _id: caseRecord.targetId }).select(
          "_id checkoutId buyerId sellerId items status paymentMethod paymentStatus currency subtotal shippingFee total carrierName trackingCode shippedAt receivedAt paymentReviewHold",
        ),
        Complaint.find({ caseId: caseRecord._id }).sort({ createdAt: 1 }),
        AuditEvent.find({ caseId: caseRecord._id })
          .sort({ createdAt: -1 })
          .limit(100)
          .select(
            "actorId action targetType targetId requestId reason fromState toState createdAt",
          )
          .lean(),
      ]);
      if (!order)
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");

      const [attempt, collection] = await Promise.all([
        order.paymentMethod === "VNPAY"
          ? PaymentAttempt.findOne({ checkoutId: order.checkoutId }).select(
              "_id provider merchantReference status verifiedAt",
            )
          : null,
        CodCollection.findOne({ orderId: order._id }).select(
          "amount currency source recordedAt",
        ),
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
          paymentReference: attempt
            ? {
                attemptId: String(attempt._id),
                provider: attempt.provider,
                merchantReference: attempt.merchantReference,
                status: attempt.status,
                verifiedAt: attempt.verifiedAt,
              }
            : null,
          codCollection: collection
            ? {
                amount: collection.amount,
                currency: collection.currency,
                source: collection.source,
                recordedAt: collection.recordedAt,
              }
            : null,
        },
        complaints: complaints.map(complaintDTO),
        auditHistory,
      });
    }

    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  },
);

module.exports = router;
