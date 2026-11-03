const mongoose = require("mongoose");
const User = require("../models/User");
const Case = require("../models/Case");
const Listing = require("../models/Listing");
const Report = require("../models/Report");
const Complaint = require("../models/Complaint");
const AuditEvent = require("../models/AuditEvent");
const { Order, PaymentAttempt } = require("../models/commerce");
const { orderItemDTO } = require("../domain/orderDTO");
const { problem } = require("../domain/commerceRules");

const ACTIVE = { $in: ["OPEN", "IN_REVIEW"] };
const SUPPORT_TIMELINE_ACTIONS = [
  "REPORT_CREATED",
  "COMPLAINT_CREATED",
  "CASE_ASSIGNED",
  "CASE_REVIEW_STARTED",
  "CASE_CLOSED",
];

function caseVersionFilter(caseRecord) {
  if (Number.isInteger(caseRecord.__v)) return { __v: caseRecord.__v };
  return { $or: [{ __v: { $exists: false } }, { __v: null }] };
}

async function fenceRead({ session, user, caseRecord, caseFilter }) {
  const userResult = await User.updateOne(
    { _id: user._id, role: user.role },
    { $inc: { caseAccessFence: 1 } },
    { session, timestamps: false },
  );
  if (userResult.matchedCount !== 1) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }

  const caseResult = await Case.updateOne(
    { $and: [caseFilter, caseVersionFilter(caseRecord)] },
    { $inc: { accessFence: 1 } },
    { session, timestamps: false },
  );
  if (caseResult.matchedCount !== 1) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
  }
}

async function readCaseWithAccess({
  caseId,
  userId,
  role,
  requestId,
  action,
  targetType = "CASE",
  targetId = caseId,
  reason = "",
  activeOnly = role === "SUPPORT",
  verify,
  load,
}) {
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findOne({ _id: userId, role }).session(session);
    if (!user) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");

    const caseFilter = {
      _id: caseId,
      ...(role === "SUPPORT" ? { assignedSupportId: user._id } : {}),
      ...(activeOnly ? { status: ACTIVE } : {}),
    };
    const caseRecord = await Case.findOne(caseFilter).session(session);
    if (!caseRecord) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    if (verify && !await verify({ session, caseRecord, user })) {
      throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    }

    await fenceRead({ session, user, caseRecord, caseFilter });
    const data = await load({ session, caseRecord, user });
    try {
      await AuditEvent.create([{
        actorId: user._id,
        action,
        targetType,
        targetId,
        requestId,
        reason,
        fromState: caseRecord.status,
        toState: caseRecord.status,
        caseId: caseRecord._id,
      }], { session });
    } catch (error) {
      throw problem(503, "AUDIT_UNAVAILABLE", "Không thể ghi nhận lượt truy cập.");
    }
    return data;
  });
}

async function supportTimeline(caseId, session) {
  const history = await AuditEvent.find({
    caseId,
    action: { $in: SUPPORT_TIMELINE_ACTIONS },
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(100)
    .select("actorId actorType action fromState toState createdAt")
    .session(session)
    .lean();
  return history.map((event) => ({
    action: event.action,
    actorType: event.actorType,
    fromState: event.fromState,
    toState: event.toState,
    createdAt: event.createdAt,
  }));
}

function supportCaseSummary(caseRecord) {
  return {
    caseId: String(caseRecord._id),
    type: caseRecord.type,
    targetType: caseRecord.targetType,
    targetId: String(caseRecord.targetId),
    status: caseRecord.status,
    version: caseRecord.version,
    assignedSupportId: String(caseRecord.assignedSupportId),
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
  };
}

function supportComplaintDTO(complaint) {
  return {
    complaintId: String(complaint._id),
    type: complaint.type,
    reasonCode: complaint.reasonCode,
    details: complaint.details,
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

async function supportCaseDetail({ caseId, userId, requestId }) {
  return readCaseWithAccess({
    caseId,
    userId,
    role: "SUPPORT",
    requestId,
    action: "CASE_DETAIL_READ",
    load: async ({ session, caseRecord }) => {
      const timeline = await supportTimeline(caseRecord._id, session);
      if (caseRecord.type === "REPORT" && caseRecord.targetType === "LISTING") {
        const listing = await Listing.findById(caseRecord.targetId).session(session);
        const reports = await Report.find({ caseId: caseRecord._id }).sort({ createdAt: 1 }).session(session);
        const approved = listing?.versions.id(listing.approvedVersionId);
        const reportVersion = approved || listing?.versions.at(-1);
        return {
          case: supportCaseSummary(caseRecord),
          listing: listing ? {
            listingId: String(listing._id),
            title: approved?.title || listing.versions.at(-1)?.title || "",
            imageIds: (reportVersion?.imageIds || []).map(String),
            saleStatus: listing.saleStatus,
            reviewHold: listing.reviewHold,
            sellerHidden: listing.sellerHidden,
            adminHidden: listing.adminHidden,
          } : null,
          reports: reports.map((report) => ({
            reportId: String(report._id),
            reasonCode: report.reasonCode,
            details: report.details,
            evidenceMediaIds: (report.evidenceMediaIds || []).map(String),
            createdAt: report.createdAt,
          })),
          timeline,
        };
      }

      if (!(["DELIVERY", "ITEM"].includes(caseRecord.type) && caseRecord.targetType === "ORDER")) {
        throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
      }
      const order = await Order.findById(caseRecord.targetId).session(session);
      if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy vụ việc.");
      const complaints = await Complaint.find({ caseId: caseRecord._id }).sort({ createdAt: 1 }).session(session);
      const attempt = order.paymentMethod === "VNPAY"
        ? await PaymentAttempt.findOne({ checkoutId: order.checkoutId })
            .select("_id provider merchantReference status verifiedAt")
            .session(session)
        : null;
      const snapshots = new Map();
      for (const complaint of complaints) {
        for (const item of complaint.itemSnapshots || []) {
          snapshots.set(String(item.orderItemId), item);
        }
      }
      return {
        case: supportCaseSummary(caseRecord),
        order: {
          orderId: String(order._id),
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          currency: order.currency,
          total: order.total,
          carrierName: order.carrierName,
          trackingCode: order.trackingCode,
          shippedAt: order.shippedAt,
          receivedAt: order.receivedAt,
          items: [...snapshots.values()].map(orderItemDTO),
          paymentReference: attempt ? {
            provider: attempt.provider,
            merchantReference: attempt.merchantReference,
            status: attempt.status,
            verifiedAt: attempt.verifiedAt,
          } : null,
        },
        complaints: complaints.map(supportComplaintDTO),
        timeline,
      };
    },
  });
}

async function readContactAccess({ caseId, userId, role, reason, requestId }) {
  return readCaseWithAccess({
    caseId,
    userId,
    role,
    requestId,
    action: "CASE_CONTACT_ACCESS_READ",
    reason,
    activeOnly: true,
    load: async ({ session, caseRecord }) => {
      if (caseRecord.targetType !== "ORDER" || !["DELIVERY", "ITEM"].includes(caseRecord.type)) {
        throw problem(409, "CONTACT_ACCESS_NOT_APPLICABLE", "Chỉ vụ việc giao nhận hoặc khiếu nại món có địa chỉ liên hệ.");
      }
      const order = await Order.findOne({ _id: caseRecord.targetId }).select("shippingAddress").session(session);
      if (!order?.shippingAddress) throw problem(404, "NOT_FOUND", "Không tìm thấy thông tin liên hệ.");
      return {
        caseId: String(caseRecord._id),
        orderId: String(order._id),
        shippingAddress: {
          fullName: order.shippingAddress.fullName,
          phone: order.shippingAddress.phone,
          address: order.shippingAddress.address,
        },
        accessedAt: new Date(),
      };
    },
  });
}

async function readCaseMedia({ caseId, user, media, scope, requestId, action }) {
  return readCaseWithAccess({
    caseId,
    userId: user._id,
    role: user.role,
    requestId,
    action,
    targetType: "MEDIA",
    targetId: media._id,
    verify: async ({ session, caseRecord }) => {
      if (scope === "EVIDENCE") {
        if (user.role === "USER" && String(media.ownerId) !== String(user._id)) return false;
        if ((caseRecord.evidenceMediaIds || []).some((id) => String(id) === String(media._id))) return true;
        return Boolean(await Report.exists({ caseId: caseRecord._id, evidenceMediaIds: media._id }).session(session));
      }
      if (scope === "LISTING_CASE") {
        if (caseRecord.type !== "REPORT" || caseRecord.targetType !== "LISTING") return false;
        const listing = await Listing.findById(caseRecord.targetId).select("approvedVersionId versions").session(session);
        const version = listing?.versions.id(listing.approvedVersionId) || listing?.versions.at(-1);
        return Boolean(version?.imageIds.some((id) => String(id) === String(media._id)));
      }
      if (scope !== "ORDER_SNAPSHOT" || caseRecord.targetType !== "ORDER" ||
          !["DELIVERY", "ITEM"].includes(caseRecord.type)) return false;
      const order = await Order.findOne({
        _id: caseRecord.targetId,
        "items.imageIds": media._id,
      }).select("items._id items.imageIds").session(session);
      if (!order) return false;
      const complaints = await Complaint.find({ caseId: caseRecord._id }).select(
        "type affectedOrderItemIds",
      ).session(session);
      const wholeOrder = caseRecord.type === "DELIVERY" && complaints.some((record) => record.type === "DELIVERY");
      if (wholeOrder) return true;
      const affectedIds = new Set(complaints
        .filter((record) => record.type === "ITEM")
        .flatMap((record) => record.affectedOrderItemIds.map(String)));
      return order.items.some((item) =>
        item.imageIds.some((id) => String(id) === String(media._id)) && affectedIds.has(String(item._id)),
      );
    },
    load: async () => true,
  });
}

module.exports = { supportCaseDetail, readContactAccess, readCaseMedia };
