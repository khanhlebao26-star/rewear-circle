const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Checkout, Order, PaymentAttempt, PaymentEvent } = require("../models/commerce");

function payloadKey(source, canonicalPayload) {
  return createHash("sha256").update(`${source}\n${canonicalPayload}`).digest("hex");
}

function normalizeTransactionStatus(responseCode, transactionStatus, source = "IPN") {
  if (responseCode === "00" && transactionStatus === "00") return "SUCCESS";
  if (transactionStatus === "01") return "PENDING";
  if (source === "QUERY" && responseCode === "00" && transactionStatus === "02") return "FAILED";
  if (responseCode === "11" && transactionStatus === "02") return "EXPIRED";
  if (transactionStatus === "02" && responseCode !== "00") return "FAILED";
  if (["04", "05", "06", "07", "09"].includes(transactionStatus) || responseCode === "07") return "NEEDS_REVIEW";
  return "NEEDS_REVIEW";
}

function auditRecord({ action, targetType, targetId, requestId, fromState = "", toState = "", reason = "" }) {
  return {
    actorType: "PROVIDER",
    actorId: null,
    action,
    targetType,
    targetId,
    requestId,
    fromState,
    toState,
    reason,
  };
}

async function markPaymentReview({ session, checkoutIds, listingIds, reason, requestId, eventId, actorType = "PROVIDER" }) {
  const checkouts = await Checkout.find({ _id: { $in: checkoutIds } }).session(session);
  const existingCheckoutIds = checkouts.map((checkout) => checkout._id);
  if (existingCheckoutIds.length) {
    await Checkout.updateMany({ _id: { $in: existingCheckoutIds } }, {
      $set: { status: "NEEDS_REVIEW" },
    }, { session });
    await Checkout.updateMany({ _id: { $in: existingCheckoutIds }, paymentMethod: "VNPAY" }, {
      $set: { paymentStatus: "NEEDS_REVIEW" },
    }, { session });
    await Order.updateMany({ checkoutId: { $in: existingCheckoutIds } }, {
      $set: { paymentReviewHold: true, paymentReviewReason: reason },
    }, { session });
    await Order.updateMany({
      checkoutId: { $in: existingCheckoutIds },
      status: { $in: ["PENDING", "PAID", "CONFIRMED"] },
    }, { $set: { status: "NEEDS_REVIEW" } }, { session });
    await Order.updateMany({ checkoutId: { $in: existingCheckoutIds }, paymentMethod: "VNPAY" }, {
      $set: { paymentStatus: "NEEDS_REVIEW" },
    }, { session });
  }

  for (const listingId of listingIds) {
    const listing = await Listing.findById(listingId).session(session);
    if (!listing) continue;
    const related = new Set(existingCheckoutIds.map(String));
    if (listing.reservedCheckoutId) related.add(String(listing.reservedCheckoutId));
    if (listing.soldCheckoutId) related.add(String(listing.soldCheckoutId));
    for (const id of listing.paymentReviewCheckoutIds || []) related.add(String(id));
    const ids = [...related].filter((id) => mongoose.isValidObjectId(id));
    await Listing.updateOne({ _id: listing._id }, {
      $set: { paymentReviewHold: true },
      $addToSet: { paymentReviewCheckoutIds: { $each: ids } },
    }, { session });
    const otherCheckouts = ids.filter((id) => !existingCheckoutIds.some((checkoutId) => String(checkoutId) === id));
    if (otherCheckouts.length) {
      await Checkout.updateMany({ _id: { $in: otherCheckouts } }, { $set: { status: "NEEDS_REVIEW" } }, { session });
      await Order.updateMany({ checkoutId: { $in: otherCheckouts } }, {
        $set: { paymentReviewHold: true, paymentReviewReason: reason },
      }, { session });
      await Order.updateMany({
        checkoutId: { $in: otherCheckouts },
        status: { $in: ["PENDING", "PAID", "CONFIRMED"] },
      }, { $set: { status: "NEEDS_REVIEW" } }, { session });
    }
  }

  await AuditEvent.create([{
    ...auditRecord({
    action: "PAYMENT_NEEDS_REVIEW",
    targetType: "PAYMENT_EVENT",
    targetId: eventId,
    requestId,
    toState: "NEEDS_REVIEW",
    reason,
    }),
    actorType,
    actorId: null,
  }], { session });
}

async function recordStandaloneEvent(input) {
  return mongoose.connection.transaction(async (session) => {
    const prior = await PaymentEvent.findOne({ eventKey: input.eventKey }).session(session);
    if (prior) return { duplicate: true, event: prior };
    const attempt = input.merchantReference
      ? await PaymentAttempt.findOne({ merchantReference: input.merchantReference }).session(session)
      : null;
    const [event] = await PaymentEvent.create([{
      ...input,
      paymentAttemptId: attempt?._id || null,
      signatureStatus: input.signatureStatus,
      decision: input.decision || "REJECTED",
      receivedAt: new Date(),
    }], { session });
    await AuditEvent.create([{
      ...auditRecord({
        action: "PAYMENT_RESULT_IGNORED",
        targetType: "PAYMENT_EVENT",
        targetId: event._id,
        requestId: input.requestId || "provider",
        toState: event.decision,
        reason: input.reasonCode || "UNVERIFIED_RESULT",
      }),
      actorType: input.source === "QUERY" ? "SYSTEM" : "PROVIDER",
      actorId: null,
    }], { session });
    return { duplicate: false, event };
  });
}

async function settleVerifiedResult(input) {
  try {
    return await mongoose.connection.transaction(async (session) => {
      const prior = await PaymentEvent.findOne({ eventKey: input.eventKey }).session(session);
      if (prior) return { duplicate: true, event: prior, ackCode: "02" };

      const attempt = await PaymentAttempt.findOne({ merchantReference: input.merchantReference }).session(session);
      if (!attempt || input.tmnCode !== input.expectedTmnCode) {
        const [event] = await PaymentEvent.create([{
          ...input.event,
          paymentAttemptId: attempt?._id || null,
          merchantMatched: input.tmnCode === input.expectedTmnCode,
          referenceMatched: Boolean(attempt),
          expectedAmount: attempt?.amount ?? null,
          decision: "REJECTED",
          reasonCode: attempt ? "MERCHANT_MISMATCH" : "REFERENCE_NOT_FOUND",
        }], { session });
        await AuditEvent.create([auditRecord({
          action: "PAYMENT_RESULT_IGNORED", targetType: "PAYMENT_EVENT", targetId: event._id,
          requestId: input.requestId, toState: "REJECTED", reason: event.reasonCode,
        })], { session });
        return { duplicate: false, event, ackCode: "01" };
      }

      const checkout = await Checkout.findOne({ _id: attempt.checkoutId, buyerId: attempt.buyerId }).session(session);
      const orders = checkout ? await Order.find({ checkoutId: checkout._id }).session(session) : [];
      const listings = checkout
        ? await Listing.find({ _id: { $in: checkout.items.map((item) => item.listingId) } }).session(session)
        : [];
      const orderTotal = orders.reduce((sum, order) => sum + order.total, 0);
      const relationValid = Boolean(
        checkout && checkout.paymentMethod === "VNPAY" && String(checkout.paymentAttemptId) === String(attempt._id) &&
        checkout.currency === attempt.currency && checkout.total === attempt.amount && orders.length > 0 &&
        orders.every((order) => order.paymentMethod === "VNPAY" && String(order.checkoutId) === String(checkout._id)) &&
        orderTotal === attempt.amount && listings.length === checkout.items.length &&
        orders.flatMap((order) => order.items.map((item) => String(item.listingId))).sort().join(",") ===
          checkout.items.map((item) => String(item.listingId)).sort().join(","),
      );
      const amountValid = input.amount === attempt.amount * 100;
      const eventBase = {
        ...input.event,
        paymentAttemptId: attempt._id,
        merchantMatched: true,
        referenceMatched: true,
        amountMatched: amountValid,
        expectedAmount: attempt.amount,
        receivedAmount: Number.isSafeInteger(input.amount) ? input.amount / 100 : null,
      };

      if (!amountValid || !relationValid) {
        const [event] = await PaymentEvent.create([{
          ...eventBase,
          decision: "NEEDS_REVIEW",
          reasonCode: !amountValid ? "AMOUNT_MISMATCH" : "PURCHASE_RELATION_MISMATCH",
        }], { session });
        if (attempt.status !== "SUCCESS") {
          attempt.status = "NEEDS_REVIEW";
          attempt.reconciliation.nextAt = null;
          attempt.reconciliation.checkpoint = "NEEDS_REVIEW";
          attempt.reconciliation.leaseId = "";
          attempt.reconciliation.leaseUntil = null;
          await attempt.save({ session });
        }
        if (checkout) {
          await markPaymentReview({
            session,
            checkoutIds: [checkout._id],
            listingIds: checkout.items.map((item) => item.listingId),
            reason: !amountValid ? "AMOUNT_MISMATCH" : "PURCHASE_RELATION_MISMATCH",
            requestId: input.requestId,
            eventId: event._id,
          });
        } else {
          await AuditEvent.create([auditRecord({
            action: "PAYMENT_RESULT_IGNORED", targetType: "PAYMENT_EVENT", targetId: event._id,
            requestId: input.requestId, toState: "NEEDS_REVIEW", reason: event.reasonCode,
          })], { session });
        }
        return { duplicate: false, event, ackCode: amountValid ? "00" : "04" };
      }

      const resultType = input.resultType;
      const eventId = new mongoose.Types.ObjectId();
      const previousStatus = attempt.status;
      let decision = "IGNORED";
      let reasonCode = "RESULT_NOT_FINAL";
      let ackCode = "00";
      let ownershipConflict = false;

      if (resultType === "SUCCESS") {
        const conflictIds = new Set();
        for (const listing of listings) {
          const ownReviewOnly = (listing.paymentReviewCheckoutIds || []).every((id) => String(id) === String(checkout._id));
          if (
            ((listing.saleStatus === "RESERVED" && String(listing.reservedCheckoutId) !== String(checkout._id)) ||
             (listing.saleStatus === "SOLD" && String(listing.soldCheckoutId) !== String(checkout._id)) ||
             !ownReviewOnly || (listing.paymentReviewHold && !(listing.paymentReviewCheckoutIds || []).some((id) => String(id) === String(checkout._id))))
          ) {
            ownershipConflict = true;
            if (listing.reservedCheckoutId) conflictIds.add(String(listing.reservedCheckoutId));
            if (listing.soldCheckoutId) conflictIds.add(String(listing.soldCheckoutId));
            for (const id of listing.paymentReviewCheckoutIds || []) conflictIds.add(String(id));
          }
        }

        if (attempt.status === "SUCCESS") {
          if (attempt.providerTransactionNo && input.providerTransactionNo === attempt.providerTransactionNo) {
            decision = "DUPLICATE";
            reasonCode = "SUCCESS_ALREADY_APPLIED";
            ackCode = "02";
          } else {
            ownershipConflict = true;
            reasonCode = "CONTRADICTORY_SUCCESS";
          }
        }

        if (ownershipConflict) {
          const [event] = await PaymentEvent.create([{
            ...eventBase,
            _id: eventId,
            decision: "NEEDS_REVIEW",
            reasonCode: reasonCode === "CONTRADICTORY_SUCCESS" ? reasonCode : "LISTING_OWNERSHIP_CONFLICT",
          }], { session });
          attempt.status = "SUCCESS";
          attempt.verifiedAt ||= new Date();
          attempt.providerTransactionNo ||= input.providerTransactionNo || "";
          attempt.responseCode = input.responseCode;
          attempt.transactionStatus = input.transactionStatus;
          attempt.reconciliation.nextAt = null;
          attempt.reconciliation.checkpoint = "NEEDS_REVIEW";
          attempt.reconciliation.leaseId = "";
          attempt.reconciliation.leaseUntil = null;
          await attempt.save({ session });
          const affectedIds = [checkout._id, ...[...conflictIds].filter((id) => mongoose.isValidObjectId(id))];
          await markPaymentReview({
            session,
            checkoutIds: affectedIds,
            listingIds: listings.map((listing) => listing._id),
            reason: "LISTING_OWNERSHIP_CONFLICT",
            requestId: input.requestId,
            eventId: event._id,
          });
          return { duplicate: false, event, ackCode: "00" };
        }

        if (decision !== "DUPLICATE") {
          for (const listing of listings) {
            if (listing.saleStatus === "SOLD" && String(listing.soldCheckoutId) === String(checkout._id)) {
              if ((listing.paymentReviewCheckoutIds || []).some((id) => String(id) === String(checkout._id))) {
                await Listing.updateOne({ _id: listing._id, saleStatus: "SOLD", soldCheckoutId: checkout._id }, {
                  $set: { paymentReviewHold: false },
                  $pull: { paymentReviewCheckoutIds: checkout._id },
                }, { session });
              }
              continue;
            }
            const filter = listing.saleStatus === "RESERVED"
              ? { _id: listing._id, saleStatus: "RESERVED", reservedCheckoutId: checkout._id }
              : { _id: listing._id, saleStatus: "AVAILABLE" };
            const changed = await Listing.updateOne(filter, {
              $set: {
                saleStatus: "SOLD",
                reservedCheckoutId: null,
                reservedUntil: null,
                soldCheckoutId: checkout._id,
                paymentReviewHold: false,
              },
              $pull: { paymentReviewCheckoutIds: checkout._id },
              $inc: { __v: 1 },
            }, { session });
            if (changed.modifiedCount !== 1) {
              throw Object.assign(new Error("Listing ownership changed during settlement."), { code: "SETTLEMENT_RACE" });
            }
          }
          attempt.status = "SUCCESS";
          attempt.verifiedAt = new Date();
          attempt.providerTransactionNo = input.providerTransactionNo || "";
          attempt.responseCode = input.responseCode;
          attempt.transactionStatus = input.transactionStatus;
          attempt.reconciliation.nextAt = null;
          attempt.reconciliation.checkpoint = null;
          attempt.reconciliation.leaseId = "";
          attempt.reconciliation.leaseUntil = null;
          await attempt.save({ session });
          await Checkout.updateOne({ _id: checkout._id }, {
            $set: { status: "PAID", paymentStatus: "PAID" },
          }, { session });
          await Order.updateMany({ checkoutId: checkout._id }, {
            $set: { status: "PAID", paymentStatus: "PAID", paymentReviewHold: false, paymentReviewReason: "" },
          }, { session });
          decision = "APPLIED";
          reasonCode = "PAYMENT_SUCCESS";
        }
      } else if (resultType === "PENDING") {
        attempt.responseCode = input.responseCode;
        attempt.transactionStatus = input.transactionStatus;
        attempt.reconciliation.lastResponseAt = new Date();
        attempt.reconciliation.lastResponseCode = input.responseCode;
        attempt.reconciliation.lastTransactionStatus = input.transactionStatus;
        if (attempt.status !== "SUCCESS") await attempt.save({ session });
        reasonCode = "TRANSACTION_PENDING";
      } else if (resultType === "FAILED" || resultType === "EXPIRED") {
        if (attempt.status === "SUCCESS") {
          const [event] = await PaymentEvent.create([{
            ...eventBase,
            _id: eventId,
            decision: "NEEDS_REVIEW",
            reasonCode: "SUCCESS_FAILURE_CONFLICT",
          }], { session });
          await markPaymentReview({
            session,
            checkoutIds: [checkout._id],
            listingIds: listings.map((listing) => listing._id),
            reason: "SUCCESS_FAILURE_CONFLICT",
            requestId: input.requestId,
            eventId: event._id,
          });
          await AuditEvent.create([auditRecord({
            action: "PAYMENT_RESULT_IGNORED", targetType: "PAYMENT_EVENT", targetId: event._id,
            requestId: input.requestId, fromState: "SUCCESS", toState: "SUCCESS", reason: "STALE_FAILURE_RESULT",
          })], { session });
          return { duplicate: false, event, ackCode: "00" };
        }
        if (["FAILED", "EXPIRED"].includes(attempt.status)) {
          decision = "DUPLICATE";
          reasonCode = "FINAL_RESULT_ALREADY_APPLIED";
          ackCode = "02";
        } else {
          ownershipConflict = listings.some((listing) => {
            const hasOtherReview = (listing.paymentReviewCheckoutIds || []).some((id) => String(id) !== String(checkout._id));
            if (hasOtherReview || (listing.paymentReviewHold && !(listing.paymentReviewCheckoutIds || []).some((id) => String(id) === String(checkout._id)))) return true;
            return !(
              (listing.saleStatus === "RESERVED" && String(listing.reservedCheckoutId) === String(checkout._id)) ||
              listing.saleStatus === "AVAILABLE"
            );
          });
          if (ownershipConflict) {
            const [event] = await PaymentEvent.create([{
              ...eventBase,
              _id: eventId,
              decision: "NEEDS_REVIEW",
              reasonCode: "LISTING_OWNERSHIP_CONFLICT",
            }], { session });
            await markPaymentReview({
              session,
              checkoutIds: [checkout._id],
              listingIds: listings.map((listing) => listing._id),
              reason: "LISTING_OWNERSHIP_CONFLICT",
              requestId: input.requestId,
              eventId: event._id,
            });
            attempt.status = "NEEDS_REVIEW";
            attempt.reconciliation.nextAt = null;
            attempt.reconciliation.checkpoint = "NEEDS_REVIEW";
            attempt.reconciliation.leaseId = "";
            attempt.reconciliation.leaseUntil = null;
            await attempt.save({ session });
            return { duplicate: false, event, ackCode: "00" };
          }
          for (const listing of listings) {
            if (listing.saleStatus === "RESERVED" && String(listing.reservedCheckoutId) === String(checkout._id)) {
              const released = await Listing.updateOne({
                _id: listing._id,
                saleStatus: "RESERVED",
                reservedCheckoutId: checkout._id,
                $or: [
                  { paymentReviewCheckoutIds: { $size: 0 }, paymentReviewHold: { $ne: true } },
                  { paymentReviewCheckoutIds: { $size: 1, $all: [checkout._id] }, paymentReviewHold: true },
                ],
              }, {
                $set: { saleStatus: "AVAILABLE", reservedCheckoutId: null, reservedUntil: null, paymentReviewHold: false },
                $pull: { paymentReviewCheckoutIds: checkout._id },
                $inc: { __v: 1 },
              }, { session });
              if (released.modifiedCount !== 1) {
                throw Object.assign(new Error("Listing ownership changed during settlement."), { code: "SETTLEMENT_RACE" });
              }
            } else if (listing.saleStatus === "AVAILABLE" && (listing.paymentReviewCheckoutIds || []).some((id) => String(id) === String(checkout._id))) {
              await Listing.updateOne({ _id: listing._id, saleStatus: "AVAILABLE" }, {
                $set: { paymentReviewHold: false },
                $pull: { paymentReviewCheckoutIds: checkout._id },
              }, { session });
            }
          }
          attempt.status = resultType;
          attempt.verifiedAt = new Date();
          attempt.responseCode = input.responseCode;
          attempt.transactionStatus = input.transactionStatus;
          attempt.reconciliation.nextAt = null;
          attempt.reconciliation.checkpoint = null;
          attempt.reconciliation.leaseId = "";
          attempt.reconciliation.leaseUntil = null;
          await attempt.save({ session });
          await Checkout.updateOne({ _id: checkout._id }, {
            $set: { status: resultType === "EXPIRED" ? "EXPIRED" : "PAYMENT_FAILED", paymentStatus: resultType === "EXPIRED" ? "EXPIRED" : "PAYMENT_FAILED" },
          }, { session });
          await Order.updateMany({ checkoutId: checkout._id }, {
            $set: { status: resultType === "EXPIRED" ? "EXPIRED" : "PAYMENT_FAILED", paymentStatus: resultType === "EXPIRED" ? "EXPIRED" : "PAYMENT_FAILED" },
          }, { session });
          decision = "APPLIED";
          reasonCode = resultType === "EXPIRED" ? "PAYMENT_EXPIRED" : "PAYMENT_FAILED";
        }
      } else {
        const [event] = await PaymentEvent.create([{
          ...eventBase,
          _id: eventId,
          decision: "NEEDS_REVIEW",
          reasonCode: "UNMAPPED_PROVIDER_RESULT",
        }], { session });
        if (attempt.status !== "SUCCESS") {
          attempt.status = "NEEDS_REVIEW";
          attempt.reconciliation.nextAt = null;
          attempt.reconciliation.checkpoint = "NEEDS_REVIEW";
          attempt.reconciliation.leaseId = "";
          attempt.reconciliation.leaseUntil = null;
          await attempt.save({ session });
        }
        await markPaymentReview({
          session,
          checkoutIds: [checkout._id],
          listingIds: listings.map((listing) => listing._id),
          reason: "UNMAPPED_PROVIDER_RESULT",
          requestId: input.requestId,
          eventId: event._id,
        });
        return { duplicate: false, event, ackCode: "00" };
      }

      const [event] = await PaymentEvent.create([{
        ...eventBase,
        _id: eventId,
        decision,
        reasonCode,
      }], { session });
      await AuditEvent.create([auditRecord({
        action: decision === "APPLIED" ? "PAYMENT_RESULT_APPLIED" : "PAYMENT_RESULT_IGNORED",
        targetType: "PAYMENT_EVENT",
        targetId: event._id,
        requestId: input.requestId,
        fromState: previousStatus,
        toState: decision,
        reason: reasonCode,
      })], { session });
      return { duplicate: ackCode === "02", event, ackCode };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const prior = await PaymentEvent.findOne({ eventKey: input.eventKey });
    if (prior) return { duplicate: true, event: prior, ackCode: "02" };
    throw error;
  }
}

module.exports = {
  markPaymentReview,
  normalizeTransactionStatus,
  payloadKey,
  recordStandaloneEvent,
  settleVerifiedResult,
};
