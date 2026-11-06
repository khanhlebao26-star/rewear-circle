const Listing = require("../../models/Listing");
const Case = require("../../models/Case");
const Complaint = require("../../models/Complaint");
const ComplaintQuota = require("../../models/ComplaintQuota");
const { CodCollection, CodReturnRequest } = require("../../models/commerce");
const { orderItemDTO } = require("../../domain/orderDTO");
const { paymentReadyToShip, paymentReadyToReceive } = require("../../domain/commerceRules");

function shippingAddressDTO(address) {
  if (!address) return null;
  return {
    fullName: address.fullName,
    phone: address.phone,
    address: address.address,
  };
}

async function fulfillmentByOrder(orders, collectionsPromise, returnsPromise) {
  if (!orders.length) return new Map();
  const orderIds = orders.map((order) => order._id);
  const listingIds = orders.flatMap((order) =>
    order.items.map((item) => item.listingId),
  );
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [collections, returnRequests, listings, cases] = await Promise.all([
    collectionsPromise,
    returnsPromise,
    Listing.find({ _id: { $in: listingIds } }).select(
      "ownerId saleStatus soldCheckoutId paymentReviewHold paymentReviewCheckoutIds",
    ),
    Case.find({
      targetType: "ORDER",
      targetId: { $in: orderIds },
      type: { $in: ["DELIVERY", "ITEM"] },
      $or: [
        { status: { $in: ["OPEN", "IN_REVIEW"] } },
        { status: "CLOSED", closedAt: { $gt: cutoff } },
      ],
    }).select("targetId type status closedAt"),
  ]);
  const activeCases = cases.filter((record) => record.status !== "CLOSED");
  const complaintCounts = activeCases.length
    ? await Complaint.aggregate([
        {
          $match: { caseId: { $in: activeCases.map((record) => record._id) } },
        },
        { $group: { _id: "$caseId", count: { $sum: 1 } } },
      ])
    : [];
  const collectionByOrder = new Map(
    collections.map((collection) => [String(collection.orderId), collection]),
  );
  const returnByOrder = new Map(
    returnRequests.map((request) => [String(request.orderId), request]),
  );
  const listingById = new Map(
    listings.map((listing) => [String(listing._id), listing]),
  );
  const activeCaseByOrder = new Map(
    activeCases.map((record) => [String(record.targetId), record]),
  );
  const recentClosedCases = new Set(
    cases
      .filter((record) => record.status === "CLOSED")
      .map((record) => `${record.targetId}:${record.type}`),
  );
  const complaintCountByCase = new Map(
    complaintCounts.map((record) => [String(record._id), record.count]),
  );

  return new Map(
    orders.map((order) => {
      const items = order.items.map((item) =>
        listingById.get(String(item.listingId)),
      );
      const collection = collectionByOrder.get(String(order._id));
      const returnRequest = returnByOrder.get(String(order._id));
      const activeCase = activeCaseByOrder.get(String(order._id));
      const validCollection =
        order.paymentStatus !== "COLLECTED" ||
        Boolean(
          order.shippedAt &&
          collection &&
          String(collection._id) === String(order.codCollectionId) &&
          String(collection.buyerId) === String(order.buyerId) &&
          String(collection.sellerId) === String(order.sellerId) &&
          collection.amount === order.total &&
          collection.currency === order.currency,
        );
      const financiallySafe = Boolean(
        !order.paymentReviewHold &&
        order.paymentStatus !== "NEEDS_REVIEW" &&
        items.length === order.items.length &&
        items.every(
          (listing, index) =>
            listing &&
            String(order.items[index].sellerId) === String(order.sellerId) &&
            String(listing.ownerId) === String(order.sellerId) &&
            listing.saleStatus === "SOLD" &&
            String(listing.soldCheckoutId) === String(order.checkoutId) &&
            !listing.paymentReviewHold &&
            (listing.paymentReviewCheckoutIds || []).length === 0,
        ),
      );
      const canFulfill =
        financiallySafe &&
        validCollection &&
        paymentReadyToReceive(order) &&
        !activeCase;
      const canAddComplaint = (type) =>
        activeCase
          ? activeCase.type === type &&
            (complaintCountByCase.get(String(activeCase._id)) || 0) < 3
          : !recentClosedCases.has(`${order._id}:${type}`);
      const returnException =
        order.paymentMethod === "COD" &&
        order.status === "NEEDS_REVIEW" &&
        order.paymentStatus === "UNPAID" &&
        Boolean(order.shippedAt) &&
        !order.receivedAt &&
        !order.codCollectionId &&
        ["OPEN", "REJECTED"].includes(returnRequest?.status) &&
        String(returnRequest?.orderId) === String(order._id);
      const canComplainDelivery =
        financiallySafe &&
        !order.receivedAt &&
        canAddComplaint("DELIVERY") &&
        ((order.paymentMethod === "COD" &&
          order.status === "CONFIRMED" &&
          ["UNPAID", "COLLECTED"].includes(order.paymentStatus) &&
          (order.paymentStatus !== "COLLECTED" ||
            (order.shippedAt && validCollection))) ||
          returnException);
      const canComplainItem =
        financiallySafe &&
        order.status === "COMPLETED" &&
        Boolean(order.receivedAt) &&
        canAddComplaint("ITEM") &&
        order.paymentMethod === "COD" &&
        ["UNPAID", "COLLECTED"].includes(order.paymentStatus) &&
        validCollection;
      return [
        String(order._id),
        { canFulfill, canComplainDelivery, canComplainItem },
      ];
    }),
  );
}

async function orderDTOs(orders, viewerId) {
  const collectionsPromise = CodCollection.find({
    orderId: { $in: orders.map((order) => order._id) },
  }).exec();
  const returnsPromise = CodReturnRequest.find({
    orderId: { $in: orders.map((order) => order._id) },
  }).exec();
  const quotaPromise = ComplaintQuota.findOne({ buyerId: viewerId })
    .select("recentSubmissions")
    .lean();
  const [fulfillment, collections, returns, quota] = await Promise.all([
    fulfillmentByOrder(orders, collectionsPromise, returnsPromise),
    collectionsPromise,
    returnsPromise,
    quotaPromise,
  ]);
  const quotaAvailable =
    (quota?.recentSubmissions || []).filter(
      (submittedAt) => submittedAt.getTime() > Date.now() - 24 * 60 * 60 * 1000,
    ).length < 5;
  const collectionByOrder = new Map(
    collections.map((collection) => [String(collection.orderId), collection]),
  );
  const returnByOrder = new Map(
    returns.map((record) => [String(record.orderId), record]),
  );
  return orders.map((order) => {
    const buyer = String(order.buyerId) === String(viewerId);
    const capabilities = fulfillment.get(String(order._id)) || {};
    const mayReadAddress = buyer || capabilities.canFulfill;
    const canFulfillOrder = Boolean(capabilities.canFulfill);
    const collection = collectionByOrder.get(String(order._id));
    const returnRequest = returnByOrder.get(String(order._id));
    return {
      orderId: String(order._id),
      checkoutId: String(order.checkoutId),
      buyerId: String(order.buyerId),
      sellerId: String(order.sellerId),
      items: order.items.map(orderItemDTO),
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentReviewHold: order.paymentReviewHold,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      ...(mayReadAddress
        ? { shippingAddress: shippingAddressDTO(order.shippingAddress) }
        : {}),
      canFulfill: canFulfillOrder,
      canShip:
        !buyer &&
        canFulfillOrder &&
        paymentReadyToShip(order) &&
        !order.shippedAt,
      canConfirmReceipt:
        buyer &&
        canFulfillOrder &&
        paymentReadyToReceive(order) &&
        Boolean(order.shippedAt) &&
        !order.receivedAt,
      canComplainDelivery:
        buyer && quotaAvailable && Boolean(capabilities.canComplainDelivery),
      canComplainItem:
        buyer && quotaAvailable && Boolean(capabilities.canComplainItem),
      carrierName: order.carrierName,
      trackingCode: order.trackingCode,
      shippedAt: order.shippedAt,
      receivedAt: order.receivedAt,
      codCollection: collection
        ? {
            amount: collection.amount,
            currency: collection.currency,
            source: collection.source,
            recordedAt: collection.recordedAt,
          }
        : null,
      codReturnRequest: returnRequest
        ? {
            requestId: String(returnRequest._id),
            status: returnRequest.status,
            reason: returnRequest.reason,
            trackingCode: returnRequest.trackingCode,
            decisionReason: returnRequest.decisionReason,
            decidedAt: returnRequest.decidedAt,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  });
}

module.exports = { orderDTOs };
