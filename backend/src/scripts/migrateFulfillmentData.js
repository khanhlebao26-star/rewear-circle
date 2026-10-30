const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");
const AuditEvent = require("../models/AuditEvent");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const ComplaintQuota = require("../models/ComplaintQuota");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const Notification = require("../models/Notification");
const Report = require("../models/Report");
const { Checkout, Order, PaymentAttempt, CodCollection } = require("../models/commerce");

const apply = process.argv.includes("--apply");
const backupPath = process.argv.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length);
const itemFields = [
  "listingId", "versionId", "sellerId", "title", "category", "size", "condition",
  "description", "flaws", "price", "shipFrom", "imageIds",
];

function id(value) {
  return value == null ? "" : String(value);
}

function itemKey(item) {
  return JSON.stringify(itemFields.map((field) => (
    field === "imageIds" ? (item[field] || []).map(id) : item[field] instanceof mongoose.Types.ObjectId ? id(item[field]) : item[field] ?? null
  )));
}

function addressComplete(address) {
  return ["fullName", "phone", "address"].every((field) => typeof address?.[field] === "string" && address[field].trim());
}

function snapshotKey(address) {
  return JSON.stringify([address.fullName, address.phone, address.address]);
}

function inspectCandidate(checkout, orders, attempts, collections, listings, references) {
  const issues = [];
  if (checkout.status !== "COMPLETED") issues.push("CHECKOUT_STATE");
  if (checkout.paymentMethod && checkout.paymentMethod !== "COD") issues.push("CHECKOUT_METHOD");
  if (checkout.paymentStatus && checkout.paymentStatus !== "UNPAID") issues.push("CHECKOUT_PAYMENT_STATE");
  if (checkout.expiresAt && (
    Number.isNaN(new Date(checkout.expiresAt).getTime()) || new Date(checkout.expiresAt) > new Date()
  )) issues.push("ACTIVE_OR_INVALID_CHECKOUT_EXPIRY");
  if (checkout.paymentAttemptId || attempts.length) issues.push("PAYMENT_ATTEMPT_EXISTS");
  if (!orders.length || orders.some((order) =>
    id(order.buyerId) !== id(checkout.buyerId) ||
    (order.contractVersion != null && order.contractVersion !== 1) ||
    order.status !== "PLACED" ||
    order.paymentMethod !== "COD" ||
    order.paymentStatus !== "UNPAID"
  )) issues.push("ORDER_STATE_OR_OWNERSHIP");
  if (orders.some((order) => order.codCollectionId) || collections.length) issues.push("COD_COLLECTION_EXISTS");

  const orderItems = orders.flatMap((order) => order.items || []);
  const checkoutItemKeys = (checkout.items || []).map(itemKey).sort();
  const orderItemKeys = orderItems.map(itemKey).sort();
  if (!orderItems.length || checkoutItemKeys.length !== orderItemKeys.length ||
      checkoutItemKeys.some((key, index) => key !== orderItemKeys[index])) {
    issues.push("ITEM_SNAPSHOTS_MISMATCH");
  }

  const completeTotals = orders.length > 0 && orders.every((order) => {
    const amounts = [order.subtotal, order.shippingFee, order.total];
    const validItems = (order.items || []).every((item) =>
      Number.isSafeInteger(item.price) && (item.quantity == null || item.quantity === 1)
    );
    const itemSubtotal = (order.items || []).reduce((sum, item) => (
      sum + item.price * (item.quantity || 1)
    ), 0);
    return validItems && amounts.every(Number.isSafeInteger) &&
      Number.isSafeInteger(itemSubtotal) &&
      order.subtotal === itemSubtotal &&
      order.total === order.subtotal + order.shippingFee;
  });
  if (!completeTotals) issues.push("ORDER_TOTALS_INCOMPLETE_OR_INCONSISTENT");
  const totals = completeTotals ? {
    subtotal: orders.reduce((sum, order) => sum + order.subtotal, 0),
    shippingFee: orders.reduce((sum, order) => sum + order.shippingFee, 0),
    total: orders.reduce((sum, order) => sum + order.total, 0),
  } : null;
  if (totals && ![totals.subtotal, totals.shippingFee, totals.total].every(Number.isSafeInteger)) {
    issues.push("CHECKOUT_TOTAL_OVERFLOW");
  }
  if (totals && ["subtotal", "shippingFee", "total"].some((field) => (
    checkout[field] != null && checkout[field] !== totals[field]
  ))) issues.push("CHECKOUT_TOTAL_CONFLICT");

  const addresses = orders.map((order) => order.shippingAddress);
  const recipientKeys = new Set(addresses.filter(addressComplete).map(snapshotKey));
  if (!addresses.length || addresses.some((address) => !addressComplete(address)) || recipientKeys.size !== 1) {
    issues.push("ORDER_RECIPIENT_MISSING_OR_INCONSISTENT");
  }
  if (addressComplete(checkout.shippingAddress) && !recipientKeys.has(snapshotKey(checkout.shippingAddress))) {
    issues.push("CHECKOUT_RECIPIENT_CONFLICT");
  }
  if (checkout.shippingAddress && !addressComplete(checkout.shippingAddress) &&
      ["fullName", "phone", "address"].some((field) =>
        checkout.shippingAddress[field] != null && checkout.shippingAddress[field] !== addresses[0]?.[field]
      )) issues.push("CHECKOUT_RECIPIENT_CONFLICT");

  const orderListingIds = orderItems.map((item) => id(item.listingId));
  if (orderListingIds.some((listingId) => !mongoose.isValidObjectId(listingId))) issues.push("ITEM_LISTING_ID_INVALID");
  const listingIds = [...new Set(orderListingIds.filter(mongoose.isValidObjectId))];
  if (listingIds.length !== orderListingIds.length) issues.push("DUPLICATE_ORDER_LISTING");
  for (const listingId of listingIds) {
    const listing = listings.find((entry) => id(entry._id) === listingId);
    const reference = references.find((entry) => id(entry._id) === listingId);
    const orderItem = orderItems.find((item) => id(item.listingId) === listingId);
    if (!listing || listing.saleStatus !== "SOLD" || id(listing.ownerId) !== id(orderItem.sellerId)) {
      issues.push("LISTING_STATE_OR_OWNER");
    }
    if (listing?.soldCheckoutId && id(listing.soldCheckoutId) !== id(checkout._id)) {
      issues.push("LISTING_SOLD_CHECKOUT_CONFLICT");
    }
    if (listing?.reservedCheckoutId || listing?.paymentReviewHold || listing?.paymentReviewCheckoutIds?.length) {
      issues.push("LISTING_HOLD_EXISTS");
    }
    if (!reference || reference.itemCount !== 1 || reference.orderCount !== 1 ||
        reference.checkoutIds.length !== 1 || id(reference.checkoutIds[0]) !== id(checkout._id)) {
      issues.push("LISTING_RELATION_NOT_UNIQUE");
    }
  }

  return {
    checkout,
    orders,
    listings: listings.filter((listing) => listingIds.includes(id(listing._id))),
    totals,
    recipient: addresses[0],
    issues: [...new Set(issues)],
  };
}

async function buildPlan(session) {
  const legacyCheckouts = await Checkout.find({
    $or: [{ contractVersion: { $exists: false } }, { contractVersion: 1 }],
    status: "COMPLETED",
  }).session(session).lean();
  const checkoutIds = legacyCheckouts.map((checkout) => checkout._id);
  const orders = await Order.find({ checkoutId: { $in: checkoutIds } }).session(session).lean();
  const orderIds = orders.map((order) => order._id);
  const listingIds = [...new Set(orders.flatMap((order) => (order.items || []).map((item) => id(item.listingId)))
    .filter(mongoose.isValidObjectId))]
    .map((value) => new mongoose.Types.ObjectId(value));
  const [attempts, collections, listings, references] = await Promise.all([
    PaymentAttempt.find({ checkoutId: { $in: checkoutIds } }).session(session).lean(),
    CodCollection.find({ orderId: { $in: orderIds } }).session(session).lean(),
    Listing.find({ _id: { $in: listingIds } }).session(session).lean(),
    Order.aggregate([
      { $unwind: "$items" },
      { $match: { "items.listingId": { $in: listingIds } } },
      { $group: {
        _id: "$items.listingId",
        itemCount: { $sum: 1 },
        orderIds: { $addToSet: "$_id" },
        checkoutIds: { $addToSet: "$checkoutId" },
      } },
      { $project: { itemCount: 1, orderCount: { $size: "$orderIds" }, checkoutIds: 1 } },
    ]).session(session),
  ]);

  const plans = legacyCheckouts.map((checkout) => inspectCandidate(
    checkout,
    orders.filter((order) => id(order.checkoutId) === id(checkout._id)),
    attempts.filter((attempt) => id(attempt.checkoutId) === id(checkout._id)),
    collections.filter((collection) => orders.some((order) =>
      id(order.checkoutId) === id(checkout._id) && id(order._id) === id(collection.orderId)
    )),
    listings,
    references,
  ));
  return plans;
}

function summarize(plans) {
  return {
    candidates: plans.length,
    eligible: plans.filter((plan) => plan.issues.length === 0).length,
    expiredExpiriesToClear: plans.filter((plan) => plan.checkout.expiresAt && plan.issues.length === 0).length,
    blockedReasons: plans.flatMap((plan) => plan.issues).reduce((counts, reason) => {
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {}),
  };
}

function validateApplyTarget() {
  if (!apply) return;
  const uri = new URL(process.env.MONGODB_URI);
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(uri.hostname) ||
      decodeURIComponent(uri.pathname.slice(1)) !== "rewear_circle" ||
      process.env.NODE_ENV === "production") {
    throw new Error("Apply is restricted to the local rewear_circle database.");
  }
  if (!backupPath || !fs.statSync(backupPath, { throwIfNoEntry: false })?.size) {
    throw new Error("Apply requires the path of a non-empty, verified backup archive.");
  }
  const verification = spawnSync("mongorestore", ["--dryRun", `--archive=${backupPath}`, "--gzip", "--quiet"], { stdio: "ignore" });
  if (verification.error || verification.status !== 0) {
    throw new Error("The backup archive failed mongorestore dry-run verification.");
  }
}

async function initializeIndexes() {
  await Promise.all([Case, Complaint, ComplaintQuota, Media, Notification, Report, AuditEvent].map((Model) => Model.init()));
}

async function applyPlan(plans) {
  const blocked = plans.filter((plan) => plan.issues.length);
  if (blocked.length) throw new Error(`Migration stopped: ${JSON.stringify(summarize(plans))}`);

  await initializeIndexes();
  const migrationRequestId = `fulfillment-migration-${new Date().toISOString()}`;
  await mongoose.connection.transaction(async (session) => {
    const currentPlans = await buildPlan(session);
    if (currentPlans.length !== plans.length || currentPlans.some((plan) => plan.issues.length)) {
      throw new Error("Migration preconditions changed during index initialization; no data was migrated.");
    }

    for (const plan of currentPlans) {
      const checkoutId = plan.checkout._id;
      const orderSubtotal = plan.totals.subtotal;
      const orderTotal = plan.totals.total;
      const checkoutResult = await Checkout.updateOne(
        { _id: checkoutId, status: "COMPLETED", contractVersion: { $in: [null, 1] } },
        { $set: {
          contractVersion: 1,
          status: "CONFIRMED",
          paymentMethod: "COD",
          paymentStatus: "UNPAID",
          subtotal: orderSubtotal,
          shippingFee: plan.totals.shippingFee,
          total: orderTotal,
          collectibleAmount: orderTotal,
          collectedAmount: 0,
          outstandingAmount: orderTotal,
          shippingAddress: plan.recipient,
          expiresAt: null,
        }, $inc: { __v: 1 } },
        { session, overwriteImmutable: true },
      );
      if (checkoutResult.matchedCount !== 1) throw new Error("Checkout changed during migration.");
      const migratedCheckout = await Checkout.findById(checkoutId).session(session).lean();
      if (
        migratedCheckout.status !== "CONFIRMED" ||
        migratedCheckout.paymentMethod !== "COD" ||
        migratedCheckout.paymentStatus !== "UNPAID" ||
        migratedCheckout.subtotal !== plan.totals.subtotal ||
        migratedCheckout.shippingFee !== plan.totals.shippingFee ||
        migratedCheckout.total !== plan.totals.total ||
        migratedCheckout.expiresAt ||
        !addressComplete(migratedCheckout.shippingAddress) ||
        snapshotKey(migratedCheckout.shippingAddress) !== snapshotKey(plan.recipient)
      ) throw new Error("Migrated Checkout failed post-update verification.");

      for (const order of plan.orders) {
        const orderResult = await Order.updateOne(
          { _id: order._id, checkoutId, status: "PLACED", paymentMethod: "COD", paymentStatus: "UNPAID" },
          { $set: { contractVersion: 1, status: "CONFIRMED" }, $inc: { __v: 1 } },
          { session },
        );
        if (orderResult.matchedCount !== 1) throw new Error("Order changed during migration.");
      }

      for (const listing of plan.listings) {
        const listingResult = await Listing.updateOne(
          {
            _id: listing._id,
            ownerId: listing.ownerId,
            saleStatus: "SOLD",
            soldCheckoutId: { $in: [null, checkoutId] },
            reservedCheckoutId: null,
            paymentReviewHold: { $ne: true },
            $or: [
              { paymentReviewCheckoutIds: { $size: 0 } },
              { paymentReviewCheckoutIds: { $exists: false } },
            ],
          },
          { $set: { soldCheckoutId: checkoutId }, $inc: { __v: 1 } },
          { session },
        );
        if (listingResult.matchedCount !== 1) throw new Error("Listing changed during migration.");
      }

      await AuditEvent.create([{
        actorType: "SYSTEM",
        action: "LEGACY_CHECKOUT_MIGRATED",
        targetType: "CHECKOUT",
        targetId: checkoutId,
        requestId: migrationRequestId,
        reason: "Restored legacy COD checkout from matching Order snapshots.",
        fromState: "COMPLETED",
        toState: "CONFIRMED",
      }], { session });
    }
  });
  return { migratedCheckouts: plans.length, migratedOrders: plans.reduce((sum, plan) => sum + plan.orders.length, 0), linkedListings: plans.reduce((sum, plan) => sum + plan.listings.length, 0) };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Missing environment variable: MONGODB_URI");
  validateApplyTarget();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  const plans = await buildPlan();
  const summary = summarize(plans);
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: "DRY_RUN", ...summary, writesPerformed: 0 }, null, 2)}\n`);
    return;
  }
  const result = await applyPlan(plans);
  process.stdout.write(`${JSON.stringify({ mode: "APPLIED", ...summary, ...result }, null, 2)}\n`);
}

main().catch((error) => {
  console.error("Fulfillment migration failed:", error.message || error.name || "UNKNOWN_ERROR");
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
