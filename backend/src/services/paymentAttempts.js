const { randomBytes } = require("node:crypto");
const { isIP } = require("node:net");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Checkout, Order, PaymentAttempt } = require("../models/commerce");
const loadVnpayConfig = require("../config/vnpay");
const { problem } = require("../domain/commerceRules");
const { assertSameFingerprint } = require("../domain/idempotency");
const { buildPaymentUrl, vnpayDate } = require("./vnpayProtocol");

function clientIp(value) {
  const ip = String(value || "").replace(/^::ffff:/i, "");
  if (!isIP(ip)) throw problem(503, "PAYMENT_UNAVAILABLE", "Không xác định được địa chỉ IP để khởi tạo thanh toán.");
  return ip;
}

function merchantReference(now) {
  return `RC${vnpayDate(now).slice(0, 8)}${randomBytes(12).toString("hex")}`;
}

async function findByIdempotency(buyerId, idempotencyKey, fingerprint, session) {
  const query = PaymentAttempt.findOne({ buyerId, idempotencyKey });
  if (session) query.session(session);
  const attempt = await query.select("+paymentUrl");
  if (!attempt) return null;
  assertSameFingerprint(attempt.idempotencyFingerprint, fingerprint);
  return attempt;
}

async function createPaymentAttempt({ checkoutId, buyerId, idempotencyKey, idempotencyFingerprint, ipAddress, requestId }) {
  const priorKey = await findByIdempotency(buyerId, idempotencyKey, idempotencyFingerprint);
  if (priorKey) {
    if (String(priorKey.checkoutId) !== String(checkoutId)) {
      throw problem(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng cho checkout khác.");
    }
    return { attempt: priorKey, reused: true };
  }

  const checkoutSummary = await Checkout.findOne({ _id: checkoutId, buyerId }).select("paymentMethod");
  if (!checkoutSummary) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  if (checkoutSummary.paymentMethod !== "VNPAY") {
    throw problem(409, "PAYMENT_METHOD_NOT_SUPPORTED", "COD không tạo payment attempt VNPAY.");
  }
  const config = loadVnpayConfig();
  if (!config) throw problem(503, "PAYMENT_UNAVAILABLE", "Thanh toán VNPAY Sandbox chưa được cấu hình.");
  const ipAddr = clientIp(ipAddress);

  try {
    return await mongoose.connection.transaction(async (session) => {
      const existingByKey = await findByIdempotency(buyerId, idempotencyKey, idempotencyFingerprint, session);
      if (existingByKey) {
        if (String(existingByKey.checkoutId) !== String(checkoutId)) {
          throw problem(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng cho checkout khác.");
        }
        return { attempt: existingByKey, reused: true };
      }

      const checkout = await Checkout.findOne({ _id: checkoutId, buyerId }).session(session);
      if (!checkout) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
      if (checkout.paymentMethod !== "VNPAY") {
        throw problem(409, "PAYMENT_METHOD_NOT_SUPPORTED", "COD không tạo payment attempt VNPAY.");
      }
      if (checkout.paymentAttemptId || await PaymentAttempt.exists({ checkoutId }).session(session)) {
        throw problem(409, "PAYMENT_ATTEMPT_EXISTS", "Checkout đã có payment attempt.");
      }
      const now = new Date();
      if (checkout.status !== "PENDING_PAYMENT" || !checkout.expiresAt || checkout.expiresAt <= now) {
        throw problem(409, "CHECKOUT_UNAVAILABLE", "Checkout không còn trong thời hạn thanh toán.");
      }
      if (!Number.isSafeInteger(checkout.total) || checkout.total < 1 || checkout.total * 100 > 999_999_999_999 || checkout.currency !== "VND") {
        throw problem(409, "CHECKOUT_INVALID", "Tổng tiền Checkout không hợp lệ để thanh toán.");
      }

      const orders = await Order.find({ checkoutId: checkout._id }).session(session);
      if (!orders.length || orders.reduce((sum, order) => sum + order.total, 0) !== checkout.total ||
          orders.some((order) => order.paymentMethod !== "VNPAY" || order.status !== "PENDING" || order.paymentStatus !== "PENDING")) {
        throw problem(409, "CHECKOUT_INVALID", "Các Order không khớp với tổng tiền Checkout.");
      }

      const listingIds = checkout.items.map((item) => item.listingId);
      const listings = await Listing.find({ _id: { $in: listingIds } }).session(session);
      if (listings.length !== listingIds.length || listings.some((listing) =>
        listing.saleStatus !== "RESERVED" || String(listing.reservedCheckoutId) !== String(checkout._id) ||
        listing.paymentReviewHold || listing.paymentReviewCheckoutIds.some((id) => String(id) !== String(checkout._id)))) {
        throw problem(409, "RESERVATION_LOST", "Checkout không còn giữ an toàn toàn bộ món.");
      }

      const reference = merchantReference(now);
      const fields = {
        vnp_Version: config.version,
        vnp_Command: "pay",
        vnp_TmnCode: config.tmnCode,
        vnp_Amount: String(checkout.total * 100),
        vnp_CreateDate: vnpayDate(now),
        vnp_CurrCode: checkout.currency,
        vnp_IpAddr: ipAddr,
        vnp_Locale: "vn",
        vnp_OrderInfo: `Thanh toan don ${String(checkout._id)}`,
        vnp_OrderType: "other",
        vnp_ReturnUrl: config.returnUrl,
        vnp_TxnRef: reference,
        vnp_ExpireDate: vnpayDate(checkout.expiresAt),
      };
      const paymentUrl = buildPaymentUrl(config.paymentUrl, fields, config.hashSecret);
      const attemptId = new mongoose.Types.ObjectId();
      const [attempt] = await PaymentAttempt.create([{
        _id: attemptId,
        checkoutId: checkout._id,
        buyerId,
        provider: "VNPAY",
        merchantReference: reference,
        paymentUrl,
        amount: checkout.total,
        currency: checkout.currency,
        status: "PENDING",
        idempotencyKey,
        idempotencyFingerprint,
        requestedAt: now,
        urlCreatedAt: now,
        expiresAt: checkout.expiresAt,
        reconciliation: { nextAt: checkout.expiresAt, checkpoint: "EXPIRY" },
      }], { session });

      const linked = await Checkout.updateOne({
        _id: checkout._id,
        buyerId,
        paymentMethod: "VNPAY",
        status: "PENDING_PAYMENT",
        paymentAttemptId: null,
        expiresAt: { $gt: now },
        __v: checkout.__v,
      }, {
        $set: { paymentAttemptId: attempt._id, paymentStatus: "PENDING" },
        $inc: { __v: 1 },
      }, { session });
      if (linked.modifiedCount !== 1) {
        throw problem(409, "CHECKOUT_UNAVAILABLE", "Checkout vừa được cập nhật; hãy tải lại trạng thái.");
      }

      await AuditEvent.create([{
        actorId: buyerId,
        action: "PAYMENT_ATTEMPT_CREATED",
        targetType: "PAYMENT_ATTEMPT",
        targetId: attempt._id,
        requestId,
        fromState: "NOT_STARTED",
        toState: "PENDING",
      }], { session });
      return { attempt, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const byCheckout = await PaymentAttempt.findOne({ checkoutId }).select("+paymentUrl");
    if (byCheckout) {
      if (byCheckout.buyerId.equals(buyerId) && byCheckout.idempotencyKey === idempotencyKey) {
        assertSameFingerprint(byCheckout.idempotencyFingerprint, idempotencyFingerprint);
        return { attempt: byCheckout, reused: true };
      }
      throw problem(409, "PAYMENT_ATTEMPT_EXISTS", "Checkout đã có payment attempt.");
    }
    const byKey = await findByIdempotency(buyerId, idempotencyKey, idempotencyFingerprint);
    if (byKey) return { attempt: byKey, reused: true };
    throw problem(409, "PAYMENT_ATTEMPT_CONFLICT", "Không thể tạo payment attempt đồng thời; hãy tải lại trạng thái.");
  }
}

module.exports = { createPaymentAttempt };
