const mongoose = require("mongoose");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const ComplaintQuota = require("../models/ComplaintQuota");
const Media = require("../models/Media");
const AuditEvent = require("../models/AuditEvent");
const Notification = require("../models/Notification");
const Listing = require("../models/Listing");
const { Order, CodCollection, CodReturnRequest } = require("../models/commerce");
const { orderWrite } = require("../domain/orderWriteGate");
const { fingerprint, assertSameFingerprint } = require("../domain/idempotency");
const { problem } = require("../domain/commerceRules");

const ACTIVE_CASE = { status: { $in: ["OPEN", "IN_REVIEW"] } };
const COMPLAINT_WINDOW_MS = 24 * 60 * 60 * 1000;

function complaintFingerprint(orderId, input) {
  return fingerprint({
    operation: "ORDER_COMPLAINT",
    orderId: String(orderId),
    type: input.type,
    reasonCode: input.reasonCode,
    details: input.details,
    affectedOrderItemIds: [...input.affectedOrderItemIds].sort(),
    evidenceMediaIds: [...input.evidenceMediaIds].sort(),
  });
}

function complaintReceipt(complaint, caseRecord) {
  return {
    complaintId: String(complaint._id),
    caseId: String(caseRecord._id),
    orderId: String(complaint.orderId),
    type: complaint.type,
    caseStatus: caseRecord.status,
    receivedAt: complaint.createdAt,
  };
}

async function assertOrderSnapshotSafe(order, session) {
  if (
    order.paymentReviewHold ||
    order.paymentStatus === "NEEDS_REVIEW" ||
    !order.items.length
  ) {
    throw problem(409, "COMPLAINT_NOT_ALLOWED", "Đơn hàng đang cần rà soát.");
  }

  const listings = await Listing.find({ _id: { $in: order.items.map((item) => item.listingId) } }).session(session);
  const listingById = new Map(listings.map((listing) => [String(listing._id), listing]));
  if (listings.length !== order.items.length || order.items.some((item) => {
    const listing = listingById.get(String(item.listingId));
    return !listing ||
      String(item.sellerId) !== String(order.sellerId) ||
      String(listing.ownerId) !== String(order.sellerId) ||
      listing.saleStatus !== "SOLD" ||
      String(listing.soldCheckoutId) !== String(order.checkoutId) ||
      listing.paymentReviewHold ||
      (listing.paymentReviewCheckoutIds || []).length > 0;
  })) {
    throw problem(409, "COMPLAINT_NOT_ALLOWED", "Món trong đơn đang cần rà soát.");
  }
}

async function hasValidCodCollection(order, session) {
  if (order.paymentStatus !== "COLLECTED") return true;
  return Boolean(await CodCollection.findOne({
    _id: order.codCollectionId,
    orderId: order._id,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    amount: order.total,
    currency: order.currency,
  }).session(session));
}

async function isCodReturnComplaintEligible(order, session) {
  if (
    order.paymentMethod !== "COD" ||
    order.status !== "NEEDS_REVIEW" ||
    order.paymentStatus !== "UNPAID" ||
    !order.shippedAt || order.receivedAt || order.codCollectionId || !order.codReturnRequestId
  ) return false;

  const returnRequest = await CodReturnRequest.findOne({
    _id: order.codReturnRequestId,
    orderId: order._id,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    status: { $in: ["OPEN", "REJECTED"] },
  }).session(session);
  return Boolean(returnRequest);
}

async function assertComplaintAllowed(order, input, session) {
  await assertOrderSnapshotSafe(order, session);
  const safeCodStatus = order.paymentMethod === "COD" &&
    order.status === "CONFIRMED" && ["UNPAID", "COLLECTED"].includes(order.paymentStatus);

  if (input.type === "DELIVERY") {
    const returnException = await isCodReturnComplaintEligible(order, session);
    const isEligible = (safeCodStatus || returnException) && !order.receivedAt;
    const shipped = Boolean(order.shippedAt);
    const reasonMatches = input.reasonCode === "SELLER_NOT_SHIPPED"
      ? !shipped
      : ["NOT_RECEIVED", "DELIVERY_DELAYED"].includes(input.reasonCode)
        ? shipped
        : true;
    if (!isEligible || !reasonMatches) {
      throw problem(409, "COMPLAINT_NOT_ALLOWED", "Trạng thái đơn không cho phép gửi khiếu nại giao nhận này.");
    }
    if (order.paymentMethod === "COD" && order.paymentStatus === "COLLECTED" &&
        (!shipped || !await hasValidCodCollection(order, session))) {
      throw problem(409, "COMPLAINT_NOT_ALLOWED", "Thông tin thu COD của đơn cần được rà soát.");
    }
    return;
  }

  const paidCompletedOrder = order.status === "COMPLETED" && order.receivedAt &&
    order.paymentMethod === "COD" && ["UNPAID", "COLLECTED"].includes(order.paymentStatus);
  if (!paidCompletedOrder ||
      (order.paymentMethod === "COD" && order.paymentStatus === "COLLECTED" &&
       !await hasValidCodCollection(order, session))) {
    throw problem(409, "COMPLAINT_NOT_ALLOWED", "Chỉ gửi khiếu nại món sau khi đã nhận đơn hợp lệ.");
  }
}

async function consumeBuyerQuota(buyerId, now, session) {
  let quota = await ComplaintQuota.findOne({ buyerId }).session(session);
  if (!quota) quota = new ComplaintQuota({ buyerId, recentSubmissions: [] });

  quota.recentSubmissions = quota.recentSubmissions.filter(
    (submittedAt) => submittedAt.getTime() > now.getTime() - COMPLAINT_WINDOW_MS,
  );
  if (quota.recentSubmissions.length >= 5) {
    const retryAfter = Math.max(1, Math.ceil(
      (quota.recentSubmissions[0].getTime() + COMPLAINT_WINDOW_MS - now.getTime()) / 1000,
    ));
    throw Object.assign(
      problem(429, "RATE_LIMITED", "Bạn đã gửi tối đa 5 khiếu nại trong 24 giờ."),
      { retryAfter },
    );
  }
  quota.recentSubmissions.push(now);
  await quota.save({ session });
}

function orderItemSnapshot(item) {
  return {
    orderItemId: item._id,
    listingId: item.listingId,
    versionId: item.versionId,
    sellerId: item.sellerId,
    title: item.title,
    category: item.category,
    size: item.size,
    condition: item.condition,
    description: item.description,
    flaws: item.flaws,
    price: item.price,
    quantity: item.quantity,
    imageIds: item.imageIds,
  };
}

async function createComplaint({ orderId, buyerId, requestId, idempotencyKey, input }) {
  const fingerprintValue = complaintFingerprint(orderId, input);
  const persist = () => mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, buyerId }).session(session);
    if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");

    const prior = await Complaint.findOne({ orderId, buyerId, idempotencyKey }).session(session);
    if (prior) {
      assertSameFingerprint(prior.idempotencyFingerprint, fingerprintValue);
      const caseRecord = await Case.findById(prior.caseId).session(session);
      if (!caseRecord) throw new Error("Complaint references a missing Case.");
      return { receipt: complaintReceipt(prior, caseRecord), reused: true };
    }

    const activeCase = await Case.findOne({
      targetType: "ORDER",
      targetId: order._id,
      ...ACTIVE_CASE,
    }).session(session);
    if (activeCase && activeCase.type !== input.type) {
      throw problem(409, "ACTIVE_CASE_TYPE_CONFLICT", "Đơn đang có vụ việc thuộc loại khác.");
    }
    await assertComplaintAllowed(order, input, session);
    const requestedItemIds = new Set(input.affectedOrderItemIds);
    const selectedItems = input.type === "DELIVERY"
      ? order.items
      : order.items.filter((item) => requestedItemIds.has(String(item._id)));
    if (input.type === "ITEM" && selectedItems.length !== requestedItemIds.size) {
      throw problem(422, "VALIDATION_ERROR", "Mỗi món phải thuộc đúng đơn hàng này.");
    }

    if (activeCase) {
      const complaintCount = await Complaint.countDocuments({ caseId: activeCase._id }).session(session);
      if (complaintCount >= 3) {
        throw problem(409, "COMPLAINT_LIMIT_REACHED", "Vụ việc đã đạt giới hạn bản khiếu nại.");
      }
    } else {
      const cooldown = await Case.findOne({
        targetType: "ORDER",
        targetId: order._id,
        type: input.type,
        status: "CLOSED",
        closedAt: { $gt: new Date(Date.now() - COMPLAINT_WINDOW_MS) },
      }).sort({ closedAt: -1 }).session(session);
      if (cooldown) {
        const retryAfter = Math.max(1, Math.ceil(
          (cooldown.closedAt.getTime() + COMPLAINT_WINDOW_MS - Date.now()) / 1000,
        ));
        throw Object.assign(
          problem(429, "RATE_LIMITED", "Đợi 24 giờ sau khi đóng vụ việc trước khi gửi lại cùng loại."),
          { retryAfter },
        );
      }
    }

    const now = new Date();
    await consumeBuyerQuota(buyerId, now, session);
    const orderGate = orderWrite(order, { _id: order._id, buyerId }, {});
    const gateResult = await Order.updateOne(orderGate.filter, orderGate.update, { session });
    if (gateResult.modifiedCount !== 1) {
      throw problem(409, "COMPLAINT_NOT_ALLOWED", "Đơn hàng vừa được cập nhật; hãy tải lại.");
    }

    const caseRecord = activeCase || new Case({
      type: input.type,
      targetType: "ORDER",
      targetId: order._id,
      status: "OPEN",
      version: 0,
    });
    if (input.evidenceMediaIds.length) {
      const mediaBinding = await Media.updateMany({
        _id: { $in: input.evidenceMediaIds },
        ownerId: buyerId,
        purpose: "CASE_EVIDENCE",
        $or: [{ caseId: null }, { caseId: caseRecord._id }],
      }, { $set: { caseId: caseRecord._id } }, { session });
      if (mediaBinding.matchedCount !== input.evidenceMediaIds.length) {
        throw problem(422, "VALIDATION_ERROR", "Bằng chứng phải là ảnh của bạn, đúng mục đích và chưa gắn vụ khác.");
      }
    }

    caseRecord.evidenceMediaIds = [...new Set([
      ...(caseRecord.evidenceMediaIds || []).map(String),
      ...input.evidenceMediaIds,
    ])];
    caseRecord.version += 1;
    await caseRecord.save({ session });
    const [complaint] = await Complaint.create([{
      caseId: caseRecord._id,
      orderId: order._id,
      checkoutId: order.checkoutId,
      buyerId,
      sellerId: order.sellerId,
      type: input.type,
      reasonCode: input.reasonCode,
      details: input.details,
      affectedOrderItemIds: input.affectedOrderItemIds,
      itemSnapshots: selectedItems.map(orderItemSnapshot),
      orderStatusAtSubmission: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatusAtSubmission: order.paymentStatus,
      carrierNameAtSubmission: order.carrierName || "",
      trackingCodeAtSubmission: order.trackingCode || "",
      shippedAtSubmission: order.shippedAt || null,
      receivedAtSubmission: order.receivedAt || null,
      evidenceMediaIds: input.evidenceMediaIds,
      idempotencyKey,
      idempotencyFingerprint: fingerprintValue,
    }], { session });

    await AuditEvent.create([{
      actorId: buyerId,
      action: "COMPLAINT_CREATED",
      targetType: "COMPLAINT",
      targetId: complaint._id,
      requestId,
      reason: input.reasonCode,
      fromState: "",
      toState: caseRecord.status,
      caseId: caseRecord._id,
    }], { session });
    await Notification.create([{
      recipientId: buyerId,
      type: "COMPLAINT_RECEIVED",
      orderId: order._id,
      complaintId: complaint._id,
      caseId: caseRecord._id,
      dedupeKey: `complaint-received:${complaint._id}`,
      message: "Khiếu nại của bạn đã được tiếp nhận.",
    }], { session });

    return { receipt: complaintReceipt(complaint, caseRecord), reused: false };
  });
  try {
    return await persist();
  } catch (error) {
    if (error.code !== 11000 && error.name !== "VersionError") throw error;
    try {
      return await persist();
    } catch (retryError) {
      if (retryError.code === 11000 || retryError.name === "VersionError") {
        throw problem(409, "COMPLAINT_CONFLICT", "Đơn hoặc vụ việc vừa được cập nhật; hãy gửi lại cùng khóa.");
      }
      throw retryError;
    }
  }
}

async function listBuyerComplaints({ orderId, buyerId, page, limit, type, status }) {
  const order = await Order.findOne({ _id: orderId, buyerId }).select("_id");
  if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");

  const filter = { orderId: order._id, buyerId, ...(type ? { type } : {}) };
  if (status) {
    const matchingCases = await Case.find({ targetType: "ORDER", targetId: order._id, status }).select("_id").lean();
    filter.caseId = { $in: matchingCases.map((record) => record._id) };
  }
  const [complaints, total] = await Promise.all([
    Complaint.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Complaint.countDocuments(filter),
  ]);
  const caseIds = [...new Set(complaints.map((record) => String(record.caseId)))];
  const caseRecords = await Case.find({ _id: { $in: caseIds } }).select("status").lean();
  const statusByCaseId = new Map(caseRecords.map((record) => [String(record._id), record.status]));
  return {
    items: complaints.map((complaint) => ({
      complaintId: String(complaint._id),
      caseId: String(complaint.caseId),
      orderId: String(complaint.orderId),
      type: complaint.type,
      caseStatus: statusByCaseId.get(String(complaint.caseId)) || "CLOSED",
      receivedAt: complaint.createdAt,
    })),
    total,
  };
}

async function getBuyerComplaint({ orderId, complaintId, buyerId }) {
  const complaint = await Complaint.findOne({ _id: complaintId, orderId, buyerId }).lean();
  if (!complaint) throw problem(404, "NOT_FOUND", "Không tìm thấy khiếu nại.");
  if (complaint.contentRedacted) throw problem(410, "CONTENT_REDACTED", "Nội dung khiếu nại đã được lưu trữ.");
  const caseRecord = await Case.findById(complaint.caseId).select("status outcomeCode outcomeSummary closedAt").lean();
  if (!caseRecord) throw new Error("Complaint references a missing Case.");
  return {
    complaintId: String(complaint._id),
    caseId: String(complaint.caseId),
    orderId: String(complaint.orderId),
    type: complaint.type,
    caseStatus: caseRecord.status,
    reasonCode: complaint.reasonCode,
    details: complaint.details,
    affectedOrderItemIds: complaint.affectedOrderItemIds.map(String),
    evidenceMediaIds: complaint.evidenceMediaIds.map(String),
    receivedAt: complaint.createdAt,
    ...(caseRecord.status === "CLOSED" ? {
      outcomeCode: caseRecord.outcomeCode,
      outcomeSummary: caseRecord.outcomeSummary,
      closedAt: caseRecord.closedAt,
    } : {}),
  };
}

module.exports = { createComplaint, listBuyerComplaints, getBuyerComplaint };
