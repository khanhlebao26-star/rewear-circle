const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Case = require("../models/Case");
const AuditEvent = require("../models/AuditEvent");
const {
  Checkout,
  Order,
  CodCollection,
  CodReturnRequest,
} = require("../models/commerce");
const {
  problem,
  paymentReadyToShip,
  paymentReadyToReceive,
} = require("../domain/commerceRules");
const { orderWrite } = require("../domain/orderWriteGate");
const { assertSameFingerprint } = require("../domain/idempotency");

const ACTIVE_CASE = { status: { $in: ["OPEN", "IN_REVIEW"] } };

async function hasActiveOrderCase(orderId, session) {
  const query = Case.exists({ targetType: "ORDER", targetId: orderId, ...ACTIVE_CASE });
  if (session) query.session(session);
  return Boolean(await query);
}

async function listingsForOrder(order, session) {
  const query = Listing.find({ _id: { $in: order.items.map((item) => item.listingId) } });
  if (session) query.session(session);
  return query;
}

async function hasValidCodCollection(order, session) {
  if (order.paymentStatus !== "COLLECTED") return true;
  const query = CodCollection.findOne({
    _id: order.codCollectionId,
    orderId: order._id,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    amount: order.total,
    currency: order.currency,
  });
  if (session) query.session(session);
  return Boolean(await query);
}

async function assertNoOrderHolds(order, session) {
  if (
    order.status === "NEEDS_REVIEW" || order.paymentStatus === "NEEDS_REVIEW" ||
    order.paymentReviewHold || await hasActiveOrderCase(order._id, session)
  ) {
    throw problem(409, "ORDER_ON_HOLD", "Đơn đang được rà soát.");
  }
  const listings = await listingsForOrder(order, session);
  if (listings.length !== order.items.length || listings.some((listing) =>
    listing.paymentReviewHold || (listing.paymentReviewCheckoutIds || []).length > 0)) {
    throw problem(409, "ORDER_ON_HOLD", "Món trong đơn đang có xung đột cần rà soát.");
  }
  return listings;
}

async function assertOrderCanFulfill(order, session) {
  if (!await hasValidCodCollection(order, session)) {
    throw problem(409, "ORDER_ON_HOLD", "Thông tin thu COD của đơn cần được rà soát.");
  }
  const listings = await assertNoOrderHolds(order, session);
  const listingById = new Map(listings.map((listing) => [String(listing._id), listing]));
  if (order.items.some((item) => {
    const listing = listingById.get(String(item.listingId));
    return String(item.sellerId) !== String(order.sellerId) ||
      !listing || String(listing.ownerId) !== String(order.sellerId) ||
      listing.saleStatus !== "SOLD" || String(listing.soldCheckoutId) !== String(order.checkoutId);
  })) {
    throw problem(409, "ORDER_NOT_FULFILLABLE", "Đơn chưa có quyền nhận toàn bộ món.");
  }
  return listings;
}

async function markOrderShipped({ orderId, sellerId, carrierName, trackingCode, requestId }) {
  return mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, sellerId }).session(session);
    if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
    if (order.shippedAt) {
      if (order.carrierName === carrierName && order.trackingCode === trackingCode) {
        return { order, reused: true };
      }
      throw problem(409, "SHIPMENT_ALREADY_RECORDED", "Vận đơn đã được ghi nhận với thông tin khác.");
    }
    if (!paymentReadyToShip(order)) {
      throw problem(409, "ORDER_NOT_FULFILLABLE", "Đơn chưa đủ điều kiện gửi hàng.");
    }
    await assertOrderCanFulfill(order, session);
    const shippedAt = new Date();
    const write = orderWrite(order, {
      _id: order._id,
      sellerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      shippedAt: null,
    }, { $set: { carrierName, trackingCode, shippedAt } });
    const updated = await Order.updateOne(
      write.filter,
      write.update,
      { session },
    );
    if (updated.modifiedCount !== 1) {
      throw problem(409, "ORDER_NOT_FULFILLABLE", "Đơn vừa được cập nhật.");
    }
    await AuditEvent.create(
      [{
        actorId: sellerId,
        action: "ORDER_SHIPPED",
        targetType: "ORDER",
        targetId: order._id,
        requestId,
        fromState: order.status,
        toState: "SHIPPED",
      }],
      { session },
    );
    return { order: await Order.findById(order._id).session(session), reused: false };
  });
}

async function confirmOrderReceipt({ orderId, buyerId, requestId }) {
  return mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, buyerId }).session(session);
    if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
    if (order.status === "COMPLETED" && order.receivedAt) return { order, reused: true };
    if (!paymentReadyToReceive(order) || !order.shippedAt) {
      throw problem(409, "RECEIPT_NOT_ALLOWED", "Chỉ xác nhận nhận hàng sau khi Seller đã gửi đơn.");
    }
    await assertOrderCanFulfill(order, session);
    const receivedAt = new Date();
    const write = orderWrite(order, {
      _id: order._id,
      buyerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      shippedAt: { $ne: null },
      receivedAt: null,
    }, { $set: { status: "COMPLETED", receivedAt } });
    const updated = await Order.updateOne(
      write.filter,
      write.update,
      { session },
    );
    if (updated.modifiedCount !== 1) {
      throw problem(409, "RECEIPT_NOT_ALLOWED", "Đơn vừa được cập nhật.");
    }
    await AuditEvent.create(
      [{
        actorId: buyerId,
        action: "ORDER_RECEIVED",
        targetType: "ORDER",
        targetId: order._id,
        requestId,
        fromState: order.status,
        toState: "COMPLETED",
      }],
      { session },
    );
    return { order: await Order.findById(order._id).session(session), reused: false };
  });
}

async function syncCodCheckout(checkoutId, session) {
  const checkout = await Checkout.findOne({ _id: checkoutId, paymentMethod: "COD" }).session(session);
  if (!checkout) return null;
  const orders = await Order.find({ checkoutId }).session(session);
  const collectibleAmount = orders
    .filter((order) => !["CANCELLED", "RETURNED"].includes(order.status))
    .reduce((sum, order) => sum + order.total, 0);
  const collectedAmount = orders
    .filter((order) => order.paymentStatus === "COLLECTED")
    .reduce((sum, order) => sum + order.total, 0);
  const needsReview = orders.some((order) => order.status === "NEEDS_REVIEW" || order.paymentStatus === "NEEDS_REVIEW" || order.paymentReviewHold);

  checkout.collectibleAmount = collectibleAmount;
  checkout.collectedAmount = collectedAmount;
  checkout.outstandingAmount = Math.max(0, collectibleAmount - collectedAmount);
  checkout.status = needsReview
    ? "NEEDS_REVIEW"
    : orders.every((order) => ["CANCELLED", "RETURNED"].includes(order.status))
      ? "CANCELLED"
      : "CONFIRMED";
  checkout.paymentStatus = needsReview
    ? "NEEDS_REVIEW"
    : collectibleAmount === 0
      ? "NOT_DUE"
      : collectedAmount === 0
        ? "UNPAID"
        : collectedAmount < collectibleAmount
          ? "PARTIALLY_COLLECTED"
          : "COLLECTED";
  await checkout.save({ session });
  return checkout;
}

async function findCodCollection(sellerId, idempotencyKey, fingerprint, session) {
  const query = CodCollection.findOne({ sellerId, idempotencyKey });
  if (session) query.session(session);
  const existing = await query;
  if (!existing) return null;
  assertSameFingerprint(existing.idempotencyFingerprint, fingerprint);
  return existing;
}

async function cancelCodOrder({ orderId, buyerId, requestId }) {
  return mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, buyerId, paymentMethod: "COD" }).session(session);
    if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
    if (order.status === "CANCELLED" && order.paymentStatus === "NOT_DUE") {
      return { order, reused: true };
    }
    if (
      order.status !== "CONFIRMED" || order.shippedAt || order.receivedAt ||
      order.paymentStatus !== "UNPAID" || order.codCollectionId
    ) {
      throw problem(409, "ORDER_NOT_CANCELLABLE", "Đơn COD chỉ hủy được trước khi gửi và trước khi thu tiền.");
    }
    const listings = await assertNoOrderHolds(order, session);
    if (listings.some((listing) =>
      listing.saleStatus !== "SOLD" || String(listing.soldCheckoutId) !== String(order.checkoutId))) {
      throw problem(409, "LISTING_OWNERSHIP_CONFLICT", "Không thể trả món về kho an toàn.");
    }

    const write = orderWrite(order, {
      _id: order._id,
      buyerId,
      paymentMethod: "COD",
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      shippedAt: null,
      receivedAt: null,
      codCollectionId: null,
    }, { $set: { status: "CANCELLED", paymentStatus: "NOT_DUE" } });
    const updated = await Order.updateOne(
      write.filter,
      write.update,
      { session },
    );
    if (updated.modifiedCount !== 1) {
      throw problem(409, "ORDER_NOT_CANCELLABLE", "Đơn vừa được cập nhật.");
    }

    const released = await Listing.updateMany(
      {
        _id: { $in: order.items.map((item) => item.listingId) },
        saleStatus: "SOLD",
        soldCheckoutId: order.checkoutId,
        paymentReviewHold: { $ne: true },
        paymentReviewCheckoutIds: { $size: 0 },
      },
      { $set: { saleStatus: "AVAILABLE", soldCheckoutId: null }, $inc: { __v: 1 } },
      { session },
    );
    if (released.modifiedCount !== order.items.length) {
      throw problem(409, "LISTING_OWNERSHIP_CONFLICT", "Không thể trả toàn bộ món về kho.");
    }

    await syncCodCheckout(order.checkoutId, session);
    await AuditEvent.create(
      [{
        actorId: buyerId,
        action: "COD_ORDER_CANCELLED",
        targetType: "ORDER",
        targetId: order._id,
        requestId,
        fromState: "CONFIRMED/UNPAID",
        toState: "CANCELLED/NOT_DUE",
      }],
      { session },
    );
    return { order: await Order.findById(order._id).session(session), reused: false };
  });
}

async function recordCodCollection({
  orderId,
  sellerId,
  amount,
  note,
  requestId,
  idempotencyKey,
  idempotencyFingerprint,
}) {
  const existing = await findCodCollection(sellerId, idempotencyKey, idempotencyFingerprint);
  if (existing) return { collection: existing, reused: true };

  try {
    return await mongoose.connection.transaction(async (session) => {
      const replay = await findCodCollection(sellerId, idempotencyKey, idempotencyFingerprint, session);
      if (replay) return { collection: replay, reused: true };
      const order = await Order.findOne({ _id: orderId, sellerId, paymentMethod: "COD" }).session(session);
      if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
      if (amount !== order.total) throw problem(422, "INVALID_AMOUNT", "Số tiền thu phải bằng tổng tiền của Order.");
      if (
        !["CONFIRMED", "COMPLETED"].includes(order.status) || !order.shippedAt ||
        order.paymentStatus !== "UNPAID" || order.codCollectionId
      ) {
        throw problem(409, "COD_COLLECTION_NOT_ALLOWED", "Đơn chưa đủ điều kiện ghi nhận COD.");
      }
      await assertNoOrderHolds(order, session);

      const [collection] = await CodCollection.create(
        [{
          orderId: order._id,
          buyerId: order.buyerId,
          sellerId,
          amount,
          source: "SELLER_DECLARATION",
          requestId,
          idempotencyKey,
          idempotencyFingerprint,
          note,
        }],
        { session },
      );
      const write = orderWrite(order, {
        _id: order._id,
        sellerId,
        paymentMethod: "COD",
        status: order.status,
        paymentStatus: "UNPAID",
        codCollectionId: null,
        shippedAt: { $ne: null },
      }, { $set: { paymentStatus: "COLLECTED", codCollectionId: collection._id } });
      const updated = await Order.updateOne(
        write.filter,
        write.update,
        { session },
      );
      if (updated.modifiedCount !== 1) {
        throw problem(409, "COD_COLLECTION_NOT_ALLOWED", "Đơn vừa được cập nhật.");
      }
      await syncCodCheckout(order.checkoutId, session);
      await AuditEvent.create(
        [{
          actorId: sellerId,
          action: "COD_COLLECTION_RECORDED",
          targetType: "COD_COLLECTION",
          targetId: collection._id,
          requestId,
          fromState: "UNPAID",
          toState: "COLLECTED",
        }],
        { session },
      );
      return { collection, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const replay = await findCodCollection(sellerId, idempotencyKey, idempotencyFingerprint);
    if (!replay) {
      if (error.keyPattern?.orderId) {
        throw problem(409, "COD_COLLECTION_EXISTS", "Order đã có xác nhận thu COD.");
      }
      throw error;
    }
    return { collection: replay, reused: true };
  }
}

async function findReturnRequest(sellerId, idempotencyKey, fingerprint, session) {
  const query = CodReturnRequest.findOne({ sellerId, idempotencyKey });
  if (session) query.session(session);
  const existing = await query;
  if (!existing) return null;
  assertSameFingerprint(existing.idempotencyFingerprint, fingerprint);
  return existing;
}

async function requestCodReturn({ orderId, sellerId, reason, requestId, idempotencyKey, idempotencyFingerprint }) {
  const existing = await findReturnRequest(sellerId, idempotencyKey, idempotencyFingerprint);
  if (existing) return { returnRequest: existing, reused: true };
  try {
    return await mongoose.connection.transaction(async (session) => {
      const replay = await findReturnRequest(sellerId, idempotencyKey, idempotencyFingerprint, session);
      if (replay) return { returnRequest: replay, reused: true };
      const order = await Order.findOne({ _id: orderId, sellerId, paymentMethod: "COD" }).session(session);
      if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
      if (
        !order.shippedAt || order.status !== "CONFIRMED" || order.receivedAt ||
        order.paymentStatus !== "UNPAID" || order.codCollectionId
      ) {
        throw problem(409, "COD_RETURN_NOT_ALLOWED", "Đơn chưa đủ điều kiện yêu cầu hoàn về.");
      }
      await assertNoOrderHolds(order, session);
      if (!order.trackingCode?.trim()) {
        throw problem(409, "TRACKING_REQUIRED", "Đơn cần có mã vận đơn trước khi yêu cầu hoàn về.");
      }

      const [returnRequest] = await CodReturnRequest.create(
        [{
          orderId: order._id,
          buyerId: order.buyerId,
          sellerId,
          idempotencyKey,
          idempotencyFingerprint,
          reason,
          trackingCode: order.trackingCode,
        }],
        { session },
      );
      const write = orderWrite(order, {
        _id: order._id,
        sellerId,
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
        codCollectionId: null,
        shippedAt: { $ne: null },
        receivedAt: null,
      }, { $set: { status: "NEEDS_REVIEW", codReturnRequestId: returnRequest._id } });
      const updated = await Order.updateOne(
        write.filter,
        write.update,
        { session },
      );
      if (updated.modifiedCount !== 1) {
        throw problem(409, "COD_RETURN_NOT_ALLOWED", "Đơn vừa được cập nhật.");
      }
      await syncCodCheckout(order.checkoutId, session);
      await AuditEvent.create(
        [{
          actorId: sellerId,
          action: "COD_RETURN_REQUESTED",
          targetType: "COD_RETURN_REQUEST",
          targetId: returnRequest._id,
          requestId,
          reason,
          fromState: "CONFIRMED/UNPAID",
          toState: "NEEDS_REVIEW",
        }],
        { session },
      );
      return { returnRequest, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const replay = await findReturnRequest(sellerId, idempotencyKey, idempotencyFingerprint);
    if (replay) return { returnRequest: replay, reused: true };
    throw problem(409, "COD_RETURN_ALREADY_OPEN", "Đơn đã có yêu cầu hoàn đang mở.");
  }
}

async function decideCodReturn({
  orderId,
  adminId,
  requestId,
  returnRequestId,
  decision,
  reason,
  idempotencyKey,
  idempotencyFingerprint,
}) {
  const duplicate = await CodReturnRequest.findOne({
    decidedBy: adminId,
    decisionIdempotencyKey: idempotencyKey,
  });
  if (duplicate) {
    assertSameFingerprint(duplicate.decisionFingerprint, idempotencyFingerprint);
    return { returnRequest: duplicate, reused: true };
  }

  try {
    return await mongoose.connection.transaction(async (session) => {
      const prior = await CodReturnRequest.findOne({
        decidedBy: adminId,
        decisionIdempotencyKey: idempotencyKey,
      }).session(session);
      if (prior) {
        assertSameFingerprint(prior.decisionFingerprint, idempotencyFingerprint);
        return { returnRequest: prior, reused: true };
      }
      const order = await Order.findOne({ _id: orderId, paymentMethod: "COD" }).session(session);
      if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
      const returnRequest = await CodReturnRequest.findOne({
        _id: returnRequestId,
        orderId: order._id,
        status: "OPEN",
      }).session(session);
      if (!returnRequest || String(order.codReturnRequestId) !== String(returnRequest._id)) {
        throw problem(409, "COD_RETURN_NOT_OPEN", "Yêu cầu hoàn không còn mở cho đơn này.");
      }
      if (
        order.status !== "NEEDS_REVIEW" || order.paymentStatus !== "UNPAID" || !order.shippedAt ||
        order.codCollectionId || order.receivedAt
      ) {
        throw problem(409, "COD_RETURN_CONFLICT", "Đơn có trạng thái hoặc dữ liệu thu tiền chưa an toàn.");
      }

      let listings = [];
      if (decision === "ACCEPT_RETURN") {
        listings = await listingsForOrder(order, session);
        if (
          listings.length !== order.items.length ||
          listings.some((listing) => listing.saleStatus !== "SOLD" ||
            String(listing.soldCheckoutId) !== String(order.checkoutId) ||
            listing.paymentReviewHold || (listing.paymentReviewCheckoutIds || []).length > 0)
        ) {
          throw problem(409, "COD_RETURN_CONFLICT", "Quyền sở hữu hoặc hold của món cần được rà soát trước khi chấp nhận.");
        }
        if (returnRequest.trackingCode !== order.trackingCode) {
          throw problem(409, "COD_RETURN_CONFLICT", "Mã vận đơn đã thay đổi sau khi gửi yêu cầu.");
        }
        if (await hasActiveOrderCase(order._id, session)) {
          throw problem(409, "COD_RETURN_CONFLICT", "Đơn còn một vụ việc đang mở.");
        }
      }

      const now = new Date();
      returnRequest.status = decision === "ACCEPT_RETURN" ? "ACCEPTED" : "REJECTED";
      returnRequest.decidedBy = adminId;
      returnRequest.decisionReason = reason;
      returnRequest.decidedAt = now;
      returnRequest.decisionIdempotencyKey = idempotencyKey;
      returnRequest.decisionFingerprint = idempotencyFingerprint;
      await returnRequest.save({ session });

      if (decision === "ACCEPT_RETURN") {
        const write = orderWrite(order, {
          _id: order._id,
          status: "NEEDS_REVIEW",
          paymentStatus: "UNPAID",
          codCollectionId: null,
          receivedAt: null,
          codReturnRequestId: returnRequest._id,
        }, { $set: { status: "RETURNED", paymentStatus: "NOT_DUE" } });
        const updated = await Order.updateOne(
          write.filter,
          write.update,
          { session },
        );
        if (updated.modifiedCount !== 1) {
          throw problem(409, "COD_RETURN_CONFLICT", "Đơn vừa được cập nhật.");
        }
        const released = await Listing.updateMany(
          {
            _id: { $in: order.items.map((item) => item.listingId) },
            saleStatus: "SOLD",
            soldCheckoutId: order.checkoutId,
            paymentReviewHold: { $ne: true },
            paymentReviewCheckoutIds: { $size: 0 },
          },
          { $set: { saleStatus: "AVAILABLE", soldCheckoutId: null }, $inc: { __v: 1 } },
          { session },
        );
        if (released.modifiedCount !== order.items.length) {
          throw problem(409, "COD_RETURN_CONFLICT", "Không thể giải phóng an toàn toàn bộ món.");
        }
      }

      await syncCodCheckout(order.checkoutId, session);
      await AuditEvent.create(
        [{
          actorId: adminId,
          action: decision === "ACCEPT_RETURN" ? "COD_RETURN_ACCEPTED" : "COD_RETURN_REJECTED",
          targetType: "COD_RETURN_REQUEST",
          targetId: returnRequest._id,
          requestId,
          reason,
          fromState: "OPEN/NEEDS_REVIEW",
          toState: decision === "ACCEPT_RETURN" ? "ACCEPTED/RETURNED" : "REJECTED/NEEDS_REVIEW",
        }],
        { session },
      );
      return { returnRequest, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const replay = await CodReturnRequest.findOne({
      decidedBy: adminId,
      decisionIdempotencyKey: idempotencyKey,
    });
    if (!replay) throw error;
    assertSameFingerprint(replay.decisionFingerprint, idempotencyFingerprint);
    return { returnRequest: replay, reused: true };
  }
}

module.exports = {
  cancelCodOrder,
  recordCodCollection,
  requestCodReturn,
  decideCodReturn,
  markOrderShipped,
  confirmOrderReceipt,
};
