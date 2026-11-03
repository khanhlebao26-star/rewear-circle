const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Cart, Checkout, Order } = require("../models/commerce");
const { problem, approvedVersion, approvedVisibleListingQuery, snapshot } = require("../domain/commerceRules");
const { assertSameFingerprint } = require("../domain/idempotency");

function mapItemsBySeller(items) {
  const grouped = new Map();
  for (const item of items) {
    const sellerId = String(item.sellerId);
    if (!grouped.has(sellerId)) grouped.set(sellerId, []);
    grouped.get(sellerId).push(item);
  }
  return grouped;
}

async function findIdempotentCheckout(buyerId, requestKey, idempotencyFingerprint, session) {
  const query = Checkout.findOne({ buyerId, requestKey });
  if (session) query.session(session);
  const existing = await query;
  if (!existing) return null;
  assertSameFingerprint(existing.idempotencyFingerprint, idempotencyFingerprint);
  return existing;
}

async function createCheckout({
  buyerId,
  requestKey,
  idempotencyFingerprint,
  items: requestedItems,
  shippingAddress,
  paymentMethod,
  requestId,
}) {
  if (paymentMethod !== "COD") {
    throw problem(422, "PAYMENT_METHOD_UNAVAILABLE", "Hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).");
  }
  const existing = await findIdempotentCheckout(buyerId, requestKey, idempotencyFingerprint);
  if (existing) return { checkout: existing, orders: await Order.find({ checkoutId: existing._id }), reused: true };

  try {
    return await mongoose.connection.transaction(async (session) => {
      const replay = await findIdempotentCheckout(buyerId, requestKey, idempotencyFingerprint, session);
      if (replay) {
        return {
          checkout: replay,
          orders: await Order.find({ checkoutId: replay._id }).sort({ sellerId: 1 }).session(session),
          reused: true,
        };
      }

      const cart = await Cart.findOne({ buyerId }).session(session);
      const cartIds = new Set((cart?.listingIds || []).map(String));
      if (!requestedItems.every(({ listingId }) => cartIds.has(listingId))) {
        throw problem(422, "ITEM_NOT_IN_CART", "Các món được chọn phải có trong giỏ.");
      }

      const checkoutId = new mongoose.Types.ObjectId();
      const createdAt = new Date();
      const expiresAt = null;
      const snapshots = [];

      for (const item of requestedItems) {
        const listing = await Listing.findById(item.listingId).session(session);
        if (!listing) throw problem(409, "LISTING_UNAVAILABLE", "Có món không còn khả dụng.");
        if (String(listing.ownerId) === String(buyerId)) {
          throw problem(422, "OWN_LISTING", "Không thể mua món của chính mình.");
        }

        const version = approvedVersion(listing);
        if (!version || listing.saleStatus !== "AVAILABLE") {
          throw problem(409, "LISTING_UNAVAILABLE", "Có món đã được giữ, bán hoặc không còn được duyệt.");
        }
        if (String(version._id) !== item.expectedVersionId) {
          throw problem(409, "LISTING_VERSION_CONFLICT", "Tin đã thay đổi; hãy xác nhận lại phiên bản mới.");
        }
        if (version.price !== item.expectedPrice) {
          throw problem(409, "PRICE_CHANGED", "Giá tin đã thay đổi; hãy xác nhận lại giá mới.");
        }
        if (!Number.isSafeInteger(version.price) || version.price < 1) {
          throw problem(409, "LISTING_UNAVAILABLE", "Tin có giá không hợp lệ để mua.");
        }

        const update = {
          $set: { saleStatus: "SOLD", reservedCheckoutId: null, reservedUntil: null, soldCheckoutId: checkoutId },
          $inc: { __v: 1 },
        };
        const claimed = await Listing.findOneAndUpdate(
          approvedVisibleListingQuery({
            _id: item.listingId,
            ownerId: { $ne: buyerId },
            approvedVersionId: item.expectedVersionId,
            saleStatus: "AVAILABLE",
            versions: {
              $elemMatch: {
                _id: item.expectedVersionId,
                status: "APPROVED",
                price: item.expectedPrice,
              },
            },
          }),
          update,
          { returnDocument: "after", session },
        );
        if (!claimed) {
          throw problem(409, "LISTING_UNAVAILABLE", "Có món vừa được người khác giữ hoặc mua.");
        }
        snapshots.push(snapshot(claimed));
      }

      const subtotal = snapshots.reduce((sum, item) => sum + item.price, 0);
      if (!Number.isSafeInteger(subtotal)) {
        throw problem(422, "INVALID_TOTAL", "Tổng tiền vượt giới hạn hỗ trợ.");
      }
      const [checkout] = await Checkout.create(
        [{
          _id: checkoutId,
          buyerId,
          requestKey,
          idempotencyFingerprint,
          contractVersion: 2,
          items: snapshots,
          paymentMethod,
          paymentStatus: "UNPAID",
          subtotal,
          shippingFee: 0,
          total: subtotal,
          collectibleAmount: subtotal,
          collectedAmount: 0,
          outstandingAmount: subtotal,
          shippingAddress,
          expiresAt,
          status: "CONFIRMED",
          createdAt,
        }],
        { session },
      );

      const orders = [];
      for (const [sellerId, sellerItems] of mapItemsBySeller(snapshots)) {
        const orderSubtotal = sellerItems.reduce((sum, item) => sum + item.price, 0);
        const [order] = await Order.create(
          [{
            checkoutId,
            buyerId,
            sellerId,
            items: sellerItems,
            shippingAddress,
            subtotal: orderSubtotal,
            shippingFee: 0,
            total: orderSubtotal,
            contractVersion: 2,
            paymentMethod,
            paymentStatus: "UNPAID",
            status: "CONFIRMED",
          }],
          { session },
        );
        orders.push(order);
      }

      await Cart.updateOne(
        { buyerId },
        { $pull: { listingIds: { $in: snapshots.map((item) => item.listingId) } } },
        { session },
      );

      const auditEvents = [
        {
          actorId: buyerId,
          action: "CHECKOUT_CREATED",
          targetType: "CHECKOUT",
          targetId: checkoutId,
          requestId,
          toState: checkout.status,
        },
        ...orders.map((order) => ({
          actorId: buyerId,
          action: "ORDER_CREATED",
          targetType: "ORDER",
          targetId: order._id,
          requestId,
          toState: order.status,
        })),
      ];
      await AuditEvent.create(auditEvents, { session, ordered: true });

      return { checkout, orders, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const replay = await findIdempotentCheckout(buyerId, requestKey, idempotencyFingerprint);
    if (!replay) throw problem(409, "CHECKOUT_CONFLICT", "Checkout vừa được tạo đồng thời; hãy tải lại trạng thái.");
    return { checkout: replay, orders: await Order.find({ checkoutId: replay._id }), reused: true };
  }
}

module.exports = { createCheckout };
