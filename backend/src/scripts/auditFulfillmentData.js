const mongoose = require("mongoose");
const AuditEvent = require("../models/AuditEvent");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const ComplaintQuota = require("../models/ComplaintQuota");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const Notification = require("../models/Notification");
const Report = require("../models/Report");
const User = require("../models/User");
const { Checkout, Order, PaymentAttempt } = require("../models/commerce");

async function countPipeline(Model, pipeline) {
  const [result] = await Model.aggregate(pipeline);
  return result?.count || 0;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Missing environment variable: MONGODB_URI");
  await mongoose.connect(process.env.MONGODB_URI, {
    readPreference: "secondaryPreferred",
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  });

  const [caseTypes, duplicateActiveTargets, malformedClosedCases, missingCaseVersions,
    invalidAssignments, reportEvidence, caseEvidence, legacyOrders, notificationTypes,
    malformedNotifications, checkoutsByLegacyState, orderCheckoutLinks, orderItemListingLinks,
    checkoutOrderTotals, listingsBySaleState] = await Promise.all([
    Case.aggregate([
      { $group: { _id: { type: "$type", targetType: "$targetType", status: "$status" }, count: { $sum: 1 } } },
      { $sort: { "_id.type": 1, "_id.targetType": 1, "_id.status": 1 } },
    ]),
    countPipeline(Case, [
      { $match: { status: { $in: ["OPEN", "IN_REVIEW"] } } },
      { $group: { _id: { targetType: "$targetType", targetId: "$targetId" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: "count" },
    ]),
    Case.countDocuments({ status: "CLOSED", $or: [
      { outcomeCode: { $in: [null, ""] } }, { outcomeSummary: { $in: [null, ""] } }, { closedAt: null },
    ] }),
    Case.countDocuments({ version: { $exists: false } }),
    countPipeline(Case, [
      { $match: { assignedSupportId: { $ne: null } } },
      { $lookup: { from: User.collection.name, localField: "assignedSupportId", foreignField: "_id", as: "support" } },
      { $match: { $expr: { $ne: [{ $arrayElemAt: ["$support.role", 0] }, "SUPPORT"] } } },
      { $count: "count" },
    ]),
    Report.aggregate([
      { $unwind: "$evidenceMediaIds" },
      { $group: { _id: "$evidenceMediaIds", caseIds: { $addToSet: "$caseId" }, owners: { $addToSet: "$reporterId" } } },
    ]),
    Case.aggregate([
      { $unwind: "$evidenceMediaIds" },
      { $group: { _id: "$evidenceMediaIds", caseIds: { $addToSet: "$_id" } } },
    ]),
    Order.aggregate([
      { $group: { _id: { contractVersion: "$contractVersion", paymentMethod: "$paymentMethod", status: "$status", paymentStatus: "$paymentStatus" }, count: { $sum: 1 } } },
      { $sort: { "_id.contractVersion": 1, "_id.paymentMethod": 1, "_id.status": 1 } },
    ]),
    Notification.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } }, { $sort: { _id: 1 } },
    ]),
    countPipeline(Notification, [
      { $match: { $or: [
        { type: { $in: ["LISTING_APPROVED", "LISTING_REJECTED", "LISTING_CORRECTION_REQUIRED", "LISTING_HIDDEN", "LISTING_SHOWN", "REPORT_RECEIVED"] }, listingId: null },
        { type: "CASE_CLOSED", caseId: null },
        { type: "CASE_CLOSED", $expr: { $eq: [{ $cond: [{ $ifNull: ["$listingId", false] }, 1, 0] }, { $cond: [{ $ifNull: ["$orderId", false] }, 1, 0] }] } },
        { type: "COMPLAINT_RECEIVED", $or: [{ caseId: null }, { orderId: null }, { complaintId: null }] },
      ] } }, { $count: "count" },
    ]),
    Checkout.aggregate([
      { $group: { _id: { contractVersion: "$contractVersion", paymentMethod: "$paymentMethod", status: "$status", paymentStatus: "$paymentStatus" }, count: { $sum: 1 } } },
      { $sort: { "_id.contractVersion": 1, "_id.paymentMethod": 1, "_id.status": 1 } },
    ]),
    Order.aggregate([
      { $lookup: { from: Checkout.collection.name, localField: "checkoutId", foreignField: "_id", as: "checkout" } },
      { $project: {
        orderStatus: "$status",
        paymentMethod: "$paymentMethod",
        paymentStatus: "$paymentStatus",
        checkoutFound: { $gt: [{ $size: "$checkout" }, 0] },
        buyerMatches: { $eq: ["$buyerId", { $arrayElemAt: ["$checkout.buyerId", 0] }] },
        checkoutStatus: { $arrayElemAt: ["$checkout.status", 0] },
        checkoutPaymentMethod: { $arrayElemAt: ["$checkout.paymentMethod", 0] },
        itemCount: { $size: { $ifNull: ["$items", []] } },
        itemIdsPresent: { $allElementsTrue: [{ $map: { input: { $ifNull: ["$items", []] }, as: "item", in: { $ne: ["$$item._id", null] } } }] },
      } },
      { $group: { _id: {
        orderStatus: "$orderStatus", paymentMethod: "$paymentMethod", paymentStatus: "$paymentStatus",
        checkoutFound: "$checkoutFound", buyerMatches: "$buyerMatches", checkoutStatus: "$checkoutStatus",
        checkoutPaymentMethod: "$checkoutPaymentMethod", itemCount: "$itemCount", itemIdsPresent: "$itemIdsPresent",
      }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $unwind: "$items" },
      { $lookup: { from: Listing.collection.name, localField: "items.listingId", foreignField: "_id", as: "listing" } },
      { $project: {
        orderStatus: "$status",
        paymentMethod: "$paymentMethod",
        listingFound: { $gt: [{ $size: "$listing" }, 0] },
        sellerMatches: { $eq: ["$items.sellerId", { $arrayElemAt: ["$listing.ownerId", 0] }] },
        listingSaleStatus: { $arrayElemAt: ["$listing.saleStatus", 0] },
        soldCheckoutIdPresent: { $ne: [{ $ifNull: [{ $arrayElemAt: ["$listing.soldCheckoutId", 0] }, null] }, null] },
        soldCheckoutMatches: { $cond: [
          { $eq: [{ $ifNull: [{ $arrayElemAt: ["$listing.soldCheckoutId", 0] }, null] }, null] },
          null,
          { $eq: ["$checkoutId", { $arrayElemAt: ["$listing.soldCheckoutId", 0] }] },
        ] },
        checkoutId: "$checkoutId",
      } },
      { $group: { _id: {
        orderStatus: "$orderStatus", paymentMethod: "$paymentMethod", listingFound: "$listingFound",
        sellerMatches: "$sellerMatches", listingSaleStatus: "$listingSaleStatus", soldCheckoutIdPresent: "$soldCheckoutIdPresent",
        soldCheckoutMatches: "$soldCheckoutMatches",
      }, count: { $sum: 1 }, orderReferences: { $sum: 1 }, distinctCheckouts: { $addToSet: "$checkoutId" } } },
      { $project: { _id: {
        orderStatus: "$_id.orderStatus", paymentMethod: "$_id.paymentMethod", listingFound: "$_id.listingFound",
        sellerMatches: "$_id.sellerMatches", listingSaleStatus: "$_id.listingSaleStatus",
        soldCheckoutIdPresent: "$_id.soldCheckoutIdPresent", soldCheckoutMatches: "$_id.soldCheckoutMatches",
        orderReferences: "$orderReferences", distinctCheckouts: { $size: "$distinctCheckouts" },
      }, count: 1 } },
    ]),
    Checkout.aggregate([
      { $lookup: { from: Order.collection.name, localField: "_id", foreignField: "checkoutId", as: "orders" } },
      { $project: {
        status: "$status",
        orderCount: { $size: "$orders" },
        checkoutHasTotals: { $and: [
          { $ne: [{ $ifNull: ["$subtotal", null] }, null] },
          { $ne: [{ $ifNull: ["$shippingFee", null] }, null] },
          { $ne: [{ $ifNull: ["$total", null] }, null] },
        ] },
        ordersHaveCompleteTotals: { $and: [
          { $gt: [{ $size: "$orders" }, 0] },
          { $allElementsTrue: [{ $map: { input: "$orders", as: "order", in: { $and: [
            { $ne: [{ $ifNull: ["$$order.subtotal", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.shippingFee", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.total", null] }, null] },
          ] } } }] },
        ] },
        totalsMatch: { $eq: ["$total", { $sum: "$orders.total" }] },
        checkoutRecipientPresent: { $and: [
          { $ne: [{ $ifNull: ["$shippingAddress.fullName", null] }, null] },
          { $ne: [{ $ifNull: ["$shippingAddress.phone", null] }, null] },
          { $ne: [{ $ifNull: ["$shippingAddress.address", null] }, null] },
        ] },
        ordersHaveRecipientSnapshots: { $and: [
          { $gt: [{ $size: "$orders" }, 0] },
          { $allElementsTrue: [{ $map: { input: "$orders", as: "order", in: { $and: [
            { $ne: [{ $ifNull: ["$$order.shippingAddress.fullName", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.shippingAddress.phone", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.shippingAddress.address", null] }, null] },
          ] } } }] },
        ] },
        orderRecipientsConsistent: { $and: [
          { $gt: [{ $size: "$orders" }, 0] },
          { $allElementsTrue: [{ $map: { input: "$orders", as: "order", in: { $and: [
            { $ne: [{ $ifNull: ["$$order.shippingAddress.fullName", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.shippingAddress.phone", null] }, null] },
            { $ne: [{ $ifNull: ["$$order.shippingAddress.address", null] }, null] },
          ] } } }] },
          { $eq: [{ $size: { $setUnion: [{ $map: { input: "$orders", as: "order", in: "$$order.shippingAddress.fullName" } }, []] } }, 1] },
          { $eq: [{ $size: { $setUnion: [{ $map: { input: "$orders", as: "order", in: "$$order.shippingAddress.phone" } }, []] } }, 1] },
          { $eq: [{ $size: { $setUnion: [{ $map: { input: "$orders", as: "order", in: "$$order.shippingAddress.address" } }, []] } }, 1] },
        ] },
        checkoutItemSnapshotCount: { $size: { $ifNull: ["$items", []] } },
        orderItemSnapshotCount: { $sum: { $map: { input: "$orders", as: "order", in: { $size: { $ifNull: ["$$order.items", []] } } } } },
      } },
      { $group: { _id: {
        status: "$status", hasOrders: { $gt: ["$orderCount", 0] },
        orderCount: "$orderCount", checkoutHasTotals: "$checkoutHasTotals", ordersHaveCompleteTotals: "$ordersHaveCompleteTotals",
        totalsMatch: "$totalsMatch", checkoutRecipientPresent: "$checkoutRecipientPresent",
        ordersHaveRecipientSnapshots: "$ordersHaveRecipientSnapshots", orderRecipientsConsistent: "$orderRecipientsConsistent",
        checkoutItemSnapshotCount: "$checkoutItemSnapshotCount", orderItemSnapshotCount: "$orderItemSnapshotCount",
      }, count: { $sum: 1 } } },
    ]),
    Listing.aggregate([
      { $group: { _id: { saleStatus: "$saleStatus", soldCheckoutLinked: { $ne: [{ $ifNull: ["$soldCheckoutId", null] }, null] } }, count: { $sum: 1 } } },
      { $sort: { "_id.saleStatus": 1 } },
    ]),
  ]);
  const legacyCheckoutsWithPaymentAttempts = await Checkout.aggregate([
    { $match: { $or: [{ contractVersion: { $exists: false } }, { contractVersion: 1 }] } },
    { $lookup: { from: PaymentAttempt.collection.name, localField: "_id", foreignField: "checkoutId", as: "attempts" } },
    { $match: { "attempts.0": { $exists: true } } },
    { $count: "count" },
  ]);

  const evidenceById = new Map();
  for (const entry of reportEvidence) {
    evidenceById.set(String(entry._id), { caseIds: new Set(entry.caseIds.map(String)), owners: new Set(entry.owners.map(String)) });
  }
  for (const entry of caseEvidence) {
    const mediaId = String(entry._id);
    const current = evidenceById.get(mediaId) || { caseIds: new Set(), owners: new Set() };
    for (const caseId of entry.caseIds) current.caseIds.add(String(caseId));
    evidenceById.set(mediaId, current);
  }

  const media = await Media.find({ _id: { $in: [...evidenceById.keys()] } })
    .select("_id ownerId purpose caseId")
    .lean();
  const mediaById = new Map(media.map((item) => [String(item._id), item]));
  const evidenceFindings = { referenced: evidenceById.size, missingMedia: 0, wrongPurpose: 0, ownerMismatch: 0, sharedAcrossCases: 0, conflictingCaseBinding: 0 };
  for (const [mediaId, references] of evidenceById) {
    const item = mediaById.get(mediaId);
    if (!item) { evidenceFindings.missingMedia += 1; continue; }
    if (item.purpose !== "CASE_EVIDENCE") evidenceFindings.wrongPurpose += 1;
    if (references.owners.size && !references.owners.has(String(item.ownerId))) evidenceFindings.ownerMismatch += 1;
    if (references.caseIds.size > 1) evidenceFindings.sharedAcrossCases += 1;
    if (item.caseId && !references.caseIds.has(String(item.caseId))) evidenceFindings.conflictingCaseBinding += 1;
  }

  const indexes = {};
  for (const Model of [Case, Complaint, ComplaintQuota, Media, Notification, Report, AuditEvent]) {
    const expected = Model.schema.indexes().map(([keys, options]) => ({
      name: options.name || Object.entries(keys).map(([key, direction]) => `${key}_${direction}`).join("_"),
      keys,
      unique: Boolean(options.unique),
      partialFilterExpression: options.partialFilterExpression || null,
    }));
    let existing = [];
    try {
      existing = (await Model.collection.listIndexes().toArray()).map(({ name, key, unique, partialFilterExpression }) => ({
        name,
        keys: key,
        unique: Boolean(unique),
        partialFilterExpression: partialFilterExpression || null,
      }));
    } catch (error) {
      if (error.codeName !== "NamespaceNotFound") throw error;
    }
    const sameDefinition = (left, right) =>
      JSON.stringify(left.keys) === JSON.stringify(right.keys) &&
      left.unique === right.unique &&
      JSON.stringify(left.partialFilterExpression) === JSON.stringify(right.partialFilterExpression);
    indexes[Model.collection.name] = {
      expected: expected.map(({ name }) => name),
      existing,
      missing: expected.filter((definition) => !existing.some((index) => sameDefinition(definition, index))).map(({ name }) => name),
      obsolete: existing.filter((index) => !expected.some((definition) => sameDefinition(definition, index)) && index.name !== "_id_"),
    };
  }

  const output = {
    mode: "READ_ONLY_DRY_RUN",
    collections: {
      casesByTypeTargetStatus: caseTypes,
      duplicateActiveTargets: duplicateActiveTargets,
      closedCasesMissingOutcomeOrDate: malformedClosedCases,
      casesMissingVersionDefault: missingCaseVersions,
      assignmentsToMissingOrNonSupportUsers: invalidAssignments,
      evidence: evidenceFindings,
      ordersByLegacyContractAndState: legacyOrders,
      checkoutsByLegacyContractAndState: checkoutsByLegacyState,
      orderCheckoutAndItemSnapshotLinks: orderCheckoutLinks,
      orderItemListingOwnership: orderItemListingLinks,
      checkoutOrderTotalsAndRecipientSnapshots: checkoutOrderTotals,
      listingsBySaleState: listingsBySaleState,
      legacyCheckoutsWithPaymentAttempts: legacyCheckoutsWithPaymentAttempts[0]?.count || 0,
      notificationsByType: notificationTypes,
      notificationsMissingTargetShape: malformedNotifications,
      existingComplaints: await Complaint.countDocuments(),
      legacyCheckoutMigrationEvents: await AuditEvent.countDocuments({ action: "LEGACY_CHECKOUT_MIGRATED" }),
    },
    indexes,
    writesPerformed: 0,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "fulfillment_data_audit_failed",
    level: "error",
    errorType: error.name || "Error",
    errorCode: typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : "AUDIT_FAILED",
  }));
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
