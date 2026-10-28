const { createHmac, randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Checkout, Order, PaymentAttempt, PaymentEvent } = require("../models/commerce");
const loadVnpayConfig = require("../config/vnpay");
const { markPaymentReview, normalizeTransactionStatus, payloadKey, recordStandaloneEvent, settleVerifiedResult } = require("../services/paymentSettlement");
const { hashQueryDrResponse, vnpayDate, verifyQueryDrResponse } = require("../services/vnpayProtocol");

const MINUTE = 60_000;
const QUERY_RETRY_DELAY = 5 * MINUTE + 10_000;
const CLAIM_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

function canonical(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function queryRequestId(now) {
  return `QD${vnpayDate(now).slice(0, 8)}${randomBytes(10).toString("hex")}`;
}

async function expireUnattemptedCheckouts(now = new Date(), batchSize = 30) {
  const due = await Checkout.find({
    paymentMethod: "VNPAY",
    status: "PENDING_PAYMENT",
    paymentAttemptId: null,
    expiresAt: { $lte: now },
  }).select("_id").sort({ expiresAt: 1, _id: 1 }).limit(batchSize);
  let expired = 0;
  for (const row of due) {
    const result = await mongoose.connection.transaction(async (session) => {
      const checkout = await Checkout.findOne({
        _id: row._id,
        paymentMethod: "VNPAY",
        status: "PENDING_PAYMENT",
        paymentAttemptId: null,
        expiresAt: { $lte: now },
      }).session(session);
      if (!checkout || await PaymentAttempt.exists({ checkoutId: checkout._id }).session(session)) return false;

      const listingIds = checkout.items.map((item) => item.listingId);
      const listings = await Listing.find({ _id: { $in: listingIds } }).session(session);
      const safeToRelease = listings.length === listingIds.length && listings.every((listing) =>
        listing.saleStatus === "RESERVED" && String(listing.reservedCheckoutId) === String(checkout._id) &&
        listing.reservedUntil && new Date(listing.reservedUntil).getTime() === new Date(checkout.expiresAt).getTime() &&
        listing.reservedUntil <= now &&
        !listing.paymentReviewHold && (listing.paymentReviewCheckoutIds || []).length === 0);
      if (!safeToRelease) {
        const eventKey = payloadKey("EXPIRE", String(checkout._id));
        const [event] = await PaymentEvent.create([{
          source: "QUERY",
          eventKey,
          requestId: "vnpay-expiry-worker",
          merchantReference: "",
          signatureStatus: "NOT_CHECKED",
          decision: "NEEDS_REVIEW",
          reasonCode: "RESERVATION_EXPIRY_CONFLICT",
          payloadHash: eventKey,
        }], { session });
        await markPaymentReview({
          session,
          checkoutIds: [checkout._id],
          listingIds,
          reason: "RESERVATION_EXPIRY_CONFLICT",
          requestId: "vnpay-expiry-worker",
          eventId: event._id,
          actorType: "SYSTEM",
        });
        return false;
      }

      const changed = await Checkout.updateOne({
        _id: checkout._id,
        paymentMethod: "VNPAY",
        status: "PENDING_PAYMENT",
        paymentAttemptId: null,
        expiresAt: { $lte: now },
        __v: checkout.__v,
      }, { $set: { status: "EXPIRED", paymentStatus: "EXPIRED" }, $inc: { __v: 1 } }, { session });
      if (changed.modifiedCount !== 1) return false;

      for (const listing of listings) {
        const released = await Listing.updateOne({
          _id: listing._id,
          saleStatus: "RESERVED",
          reservedCheckoutId: checkout._id,
          reservedUntil: listing.reservedUntil,
          paymentReviewHold: { $ne: true },
          paymentReviewCheckoutIds: { $size: 0 },
        }, { $set: { saleStatus: "AVAILABLE", reservedCheckoutId: null, reservedUntil: null }, $inc: { __v: 1 } }, { session });
        if (released.modifiedCount !== 1) {
          throw Object.assign(new Error("Checkout reservation changed during expiry."), { code: "EXPIRY_RACE" });
        }
      }
      const orders = await Order.find({ checkoutId: checkout._id }).session(session);
      await Order.updateMany({ checkoutId: checkout._id, status: "PENDING", paymentMethod: "VNPAY" }, {
        $set: { status: "EXPIRED", paymentStatus: "EXPIRED" },
      }, { session });
      const [event] = await PaymentEvent.create([{
        source: "QUERY",
        eventKey: payloadKey("EXPIRE", `expired:${checkout._id}`),
        requestId: "vnpay-expiry-worker",
        signatureStatus: "NOT_CHECKED",
        decision: "APPLIED",
        reasonCode: "NO_PAYMENT_ATTEMPT_EXPIRED",
        payloadHash: payloadKey("EXPIRE-HASH", String(checkout._id)),
      }], { session });
      await AuditEvent.create([
        {
          actorType: "SYSTEM", action: "CHECKOUT_EXPIRED", targetType: "CHECKOUT", targetId: checkout._id,
          requestId: "vnpay-expiry-worker", fromState: "PENDING_PAYMENT", toState: "EXPIRED",
        },
        ...orders.map((order) => ({
          actorType: "SYSTEM", action: "PAYMENT_RESULT_APPLIED", targetType: "ORDER", targetId: order._id,
          requestId: "vnpay-expiry-worker", fromState: "PENDING", toState: "EXPIRED",
        })),
        {
          actorType: "SYSTEM", action: "PAYMENT_RESULT_APPLIED", targetType: "PAYMENT_EVENT", targetId: event._id,
          requestId: "vnpay-expiry-worker", fromState: "PENDING_PAYMENT", toState: "EXPIRED",
          reason: "NO_PAYMENT_ATTEMPT_EXPIRED",
        },
      ], { session, ordered: true });
      return true;
    });
    if (result) expired += 1;
  }
  return expired;
}

async function claimDueAttempt(now = new Date()) {
  const leaseId = randomBytes(16).toString("hex");
  const attempt = await PaymentAttempt.findOneAndUpdate({
    provider: "VNPAY",
    status: "PENDING",
    "reconciliation.checkpoint": { $ne: "NEEDS_REVIEW" },
    "reconciliation.nextAt": { $lte: now },
    $or: [
      { "reconciliation.leaseUntil": null },
      { "reconciliation.leaseUntil": { $lte: now } },
    ],
  }, {
    $set: { "reconciliation.leaseId": leaseId, "reconciliation.leaseUntil": new Date(now.getTime() + CLAIM_MS) },
  }, { sort: { "reconciliation.nextAt": 1, _id: 1 }, returnDocument: "after" });
  return attempt;
}

async function scheduleAttempt(attempt, { nextAt, checkpoint }) {
  await PaymentAttempt.updateOne({
    _id: attempt._id,
    status: "PENDING",
    "reconciliation.leaseId": attempt.reconciliation.leaseId,
  }, {
    $set: {
      "reconciliation.nextAt": nextAt,
      "reconciliation.checkpoint": checkpoint,
      "reconciliation.leaseId": "",
      "reconciliation.leaseUntil": null,
    },
  });
}

async function beginQuery(attempt, now) {
  const requestId = queryRequestId(now);
  const changed = await mongoose.connection.transaction(async (session) => {
    const updated = await PaymentAttempt.findOneAndUpdate({
      _id: attempt._id,
      status: "PENDING",
      "reconciliation.leaseId": attempt.reconciliation.leaseId,
    }, {
      $set: { "reconciliation.lastRequestedAt": now },
      $inc: { "reconciliation.requestCount": 1 },
    }, { session, returnDocument: "after" });
    if (!updated) return null;
    const checkpoint = updated.reconciliation.checkpoint;
    if (checkpoint === "EXPIRY") {
      updated.reconciliation.nextAt = new Date(updated.expiresAt.getTime() + MINUTE);
      updated.reconciliation.checkpoint = "PLUS_1_MIN";
    } else if (checkpoint === "PLUS_5_MIN") {
      updated.reconciliation.nextAt = new Date(now.getTime() + QUERY_RETRY_DELAY);
    }
    await updated.save({ session });
    await AuditEvent.create([{
      actorType: "SYSTEM",
      action: "PAYMENT_RECONCILIATION_REQUESTED",
      targetType: "PAYMENT_ATTEMPT",
      targetId: updated._id,
      requestId,
      fromState: updated.status,
      toState: checkpoint,
    }], { session });
    return updated;
  });
  return changed ? { attempt: changed, requestId } : null;
}

function queryDrRequest(attempt, config, requestId, now) {
  const fields = {
    vnp_RequestId: requestId,
    vnp_Version: config.version,
    vnp_Command: "querydr",
    vnp_TmnCode: config.tmnCode,
    vnp_TxnRef: attempt.merchantReference,
    ...(attempt.providerTransactionNo ? { vnp_TransactionNo: attempt.providerTransactionNo } : {}),
    vnp_TransactionDate: vnpayDate(attempt.requestedAt),
    vnp_CreateDate: vnpayDate(now),
    vnp_IpAddr: config.queryServerIp,
    vnp_OrderInfo: `Query transaction ${attempt.merchantReference}`,
  };
  const signData = [
    fields.vnp_RequestId, fields.vnp_Version, fields.vnp_Command, fields.vnp_TmnCode,
    fields.vnp_TxnRef, fields.vnp_TransactionDate, fields.vnp_CreateDate, fields.vnp_IpAddr,
    fields.vnp_OrderInfo,
  ].join("|");
  fields.vnp_SecureHash = createHmac("sha512", config.hashSecret).update(signData, "utf8").digest("hex");
  return fields;
}

function safeResponse(response) {
  const result = {};
  for (const [key, value] of Object.entries(response || {})) {
    if (!key.startsWith("vnp_")) continue;
    if (typeof value !== "string" && typeof value !== "number") return null;
    result[key] = String(value);
  }
  return result;
}

async function queryProvider(attempt, config, requestId, now) {
  const request = queryDrRequest(attempt, config, requestId, now);
  const response = await fetch(config.queryDrUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok || raw.length > 32_000) throw new Error("QUERY_HTTP_ERROR");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("QUERY_INVALID_JSON"); }
  const fields = safeResponse(parsed);
  if (!fields) throw new Error("QUERY_INVALID_RESPONSE");
  const responseHashValid = verifyQueryDrResponse(fields, config.hashSecret);
  const required = ["vnp_ResponseId", "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_ResponseCode", "vnp_TransactionStatus", "vnp_SecureHash"];
  const shapeValid = required.every((key) => typeof fields[key] === "string" && fields[key].length > 0) &&
    /^[A-Za-z0-9]{1,32}$/.test(fields.vnp_ResponseId) && /^\d{1,12}$/.test(fields.vnp_Amount) &&
    /^\d{2}$/.test(fields.vnp_ResponseCode) && /^\d{2}$/.test(fields.vnp_TransactionStatus);
  return { fields, responseHashValid, shapeValid, httpStatus: response.status };
}

async function markNeedsReview(attempt, reasonCode, requestId) {
  return mongoose.connection.transaction(async (session) => {
    const current = await PaymentAttempt.findById(attempt._id).session(session);
    if (!current || current.status === "SUCCESS" || current.status === "FAILED" || current.status === "EXPIRED") return false;
    const checkout = await Checkout.findById(current.checkoutId).session(session);
    if (!checkout) return false;
    const eventKey = payloadKey("REVIEW", `${current._id}:${reasonCode}`);
    let event = await PaymentEvent.findOne({ eventKey }).session(session);
    if (!event) {
      [event] = await PaymentEvent.create([{
        paymentAttemptId: current._id,
        source: "QUERY",
        eventKey,
        requestId,
        merchantReference: current.merchantReference,
        signatureStatus: "NOT_CHECKED",
        decision: "NEEDS_REVIEW",
        reasonCode,
        payloadHash: eventKey,
      }], { session });
    }
    current.status = "NEEDS_REVIEW";
    current.reconciliation.nextAt = null;
    current.reconciliation.checkpoint = "NEEDS_REVIEW";
    current.reconciliation.leaseId = "";
    current.reconciliation.leaseUntil = null;
    await current.save({ session });
    await markPaymentReview({
      session,
      checkoutIds: [checkout._id],
      listingIds: checkout.items.map((item) => item.listingId),
      reason: reasonCode,
      requestId,
      eventId: event._id,
      actorType: "SYSTEM",
    });
    return true;
  });
}

async function logQueryFailure(attempt, requestId, reasonCode) {
  const eventKey = payloadKey("QUERY_ERROR", requestId);
  await recordStandaloneEvent({
    source: "QUERY",
    eventKey,
    requestId,
    providerRequestId: requestId,
    merchantReference: attempt.merchantReference,
    signatureStatus: "NOT_CHECKED",
    decision: "IGNORED",
    reasonCode,
    payloadHash: eventKey,
  });
}

async function processClaimedAttempt(claimed, config, now = new Date()) {
  const checkpoint = claimed.reconciliation.checkpoint;
  if (["PLUS_1_MIN", "PLUS_3_MIN"].includes(checkpoint)) {
    const nextMinute = checkpoint === "PLUS_1_MIN" ? 3 : 5;
    await scheduleAttempt(claimed, {
      nextAt: new Date(claimed.expiresAt.getTime() + nextMinute * MINUTE),
      checkpoint: checkpoint === "PLUS_1_MIN" ? "PLUS_3_MIN" : "PLUS_5_MIN",
    });
    return "CHECKPOINT_RECORDED";
  }

  if (claimed.reconciliation.lastRequestedAt) {
    const allowedAt = new Date(claimed.reconciliation.lastRequestedAt.getTime() + QUERY_RETRY_DELAY);
    if (now < allowedAt) {
      await scheduleAttempt(claimed, {
        nextAt: checkpoint === "EXPIRY" ? new Date(claimed.expiresAt.getTime() + MINUTE) : allowedAt,
        checkpoint: checkpoint === "EXPIRY" ? "PLUS_1_MIN" : checkpoint,
      });
      return "QUERY_THROTTLED";
    }
  }

  const begun = await beginQuery(claimed, now);
  if (!begun) return "LEASE_LOST";
  try {
    const result = await queryProvider(begun.attempt, config, begun.requestId, now);
    const fields = result.fields;
    const eventKey = payloadKey("QUERY", canonical(fields));
    const trusted = result.responseHashValid && result.shapeValid;
    if (!trusted) {
      await recordStandaloneEvent({
        source: "QUERY",
        eventKey,
        requestId: begun.requestId,
        providerRequestId: begun.requestId,
        providerResponseId: fields.vnp_ResponseId || "",
        merchantReference: fields.vnp_TxnRef || claimed.merchantReference,
        providerTransactionNo: fields.vnp_TransactionNo || "",
        signatureStatus: result.responseHashValid ? "VALID" : "INVALID",
        decision: "REJECTED",
        reasonCode: result.responseHashValid ? "INVALID_QUERY_RESPONSE" : "INVALID_QUERY_SIGNATURE",
        payloadHash: eventKey,
      });
    } else {
      const identityMatches = fields.vnp_Command === "querydr" &&
        fields.vnp_TmnCode === config.tmnCode && fields.vnp_TxnRef === begun.attempt.merchantReference;
      const amount = Number(fields.vnp_Amount);
      let resultType = "PENDING";
      if (identityMatches && fields.vnp_ResponseCode === "00") {
        resultType = fields.vnp_TransactionType && fields.vnp_TransactionType !== "01"
          ? "NEEDS_REVIEW"
          : normalizeTransactionStatus(fields.vnp_ResponseCode, fields.vnp_TransactionStatus, "QUERY");
      }
      await settleVerifiedResult({
        eventKey,
        requestId: begun.requestId,
        providerRequestId: begun.requestId,
        providerResponseId: fields.vnp_ResponseId,
        merchantReference: fields.vnp_TxnRef,
        tmnCode: fields.vnp_TmnCode,
        expectedTmnCode: config.tmnCode,
        amount,
        responseCode: fields.vnp_ResponseCode,
        transactionStatus: fields.vnp_TransactionStatus,
        providerTransactionNo: fields.vnp_TransactionNo || "",
        resultType,
        event: {
          source: "QUERY",
          eventKey,
          requestId: begun.requestId,
          providerRequestId: begun.requestId,
          providerResponseId: fields.vnp_ResponseId,
          merchantReference: fields.vnp_TxnRef,
          providerTransactionNo: fields.vnp_TransactionNo || "",
          signatureStatus: "VALID",
          merchantMatched: fields.vnp_TmnCode === config.tmnCode,
          referenceMatched: fields.vnp_TxnRef === begun.attempt.merchantReference,
          amountMatched: amount === begun.attempt.amount * 100,
          receivedAmount: Number.isSafeInteger(amount) ? amount / 100 : null,
          responseCode: fields.vnp_ResponseCode,
          transactionStatus: fields.vnp_TransactionStatus,
          payloadHash: eventKey,
        },
      });
    }

    const current = await PaymentAttempt.findById(claimed._id);
    if (!current || current.status !== "PENDING") return "SETTLED";
    if (checkpoint === "PLUS_5_MIN") {
      await markNeedsReview(current, "QUERYDR_UNRESOLVED_AFTER_FINAL_CHECKPOINT", begun.requestId);
      return "NEEDS_REVIEW";
    }
    await scheduleAttempt({ ...current.toObject(), reconciliation: { ...current.reconciliation.toObject(), leaseId: claimed.reconciliation.leaseId } }, {
      nextAt: new Date(claimed.expiresAt.getTime() + MINUTE),
      checkpoint: "PLUS_1_MIN",
    });
    return "QUERY_PENDING";
  } catch (error) {
    await logQueryFailure(begun.attempt, begun.requestId, error.name === "TimeoutError" ? "QUERY_TIMEOUT" : "QUERY_UNAVAILABLE");
    const current = await PaymentAttempt.findById(claimed._id);
    if (!current || current.status !== "PENDING") return "SETTLED";
    if (checkpoint === "PLUS_5_MIN") {
      await markNeedsReview(current, "QUERYDR_UNRESOLVED_AFTER_FINAL_CHECKPOINT", begun.requestId);
      return "NEEDS_REVIEW";
    }
    await scheduleAttempt({ ...current.toObject(), reconciliation: { ...current.reconciliation.toObject(), leaseId: claimed.reconciliation.leaseId } }, {
      nextAt: new Date(claimed.expiresAt.getTime() + MINUTE),
      checkpoint: "PLUS_1_MIN",
    });
    return "QUERY_RETRY_SCHEDULED";
  }
}

async function runReconciliationCycle({ now = new Date(), batchSize = 30 } = {}) {
  const expiredWithoutAttempt = await expireUnattemptedCheckouts(now, batchSize);
  const config = loadVnpayConfig();
  if (!config) return { expiredWithoutAttempt, processed: 0, disabled: true };
  let processed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const claimed = await claimDueAttempt(now);
    if (!claimed) break;
    processed += 1;
    await processClaimedAttempt(claimed, config, now);
  }
  return { expiredWithoutAttempt, processed, disabled: false };
}

module.exports = {
  claimDueAttempt,
  expireUnattemptedCheckouts,
  processClaimedAttempt,
  queryDrRequest,
  runReconciliationCycle,
};
