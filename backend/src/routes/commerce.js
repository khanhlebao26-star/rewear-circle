const router = require("express").Router();
const Listing = require("../models/Listing");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const ComplaintQuota = require("../models/ComplaintQuota");
const AuditEvent = require("../models/AuditEvent");
const {
  Cart,
  Checkout,
  Order,
  CodCollection,
  CodReturnRequest,
} = require("../models/commerce");
const { createCheckout } = require("../services/checkout");
const {
  cancelCodOrder,
  recordCodCollection,
  requestCodReturn,
  decideCodReturn,
  markOrderShipped,
  confirmOrderReceipt,
} = require("../services/codOrders");
const { success, failure } = require("../http/responses");
const { readDiscoveryQuery } = require("../domain/discoveryRules");
const { orderItemDTO } = require("../domain/orderDTO");
const { readIdempotencyKey, fingerprint } = require("../domain/idempotency");
const { readComplaintInput } = require("../domain/moderationRules");
const { createComplaint, listBuyerComplaints, getBuyerComplaint } = require("../services/complaints");
const {
  requireAuth,
  requireVerifiedEmail,
  requireAdmin,
} = require("../middleware/requireAuth");
const {
  problem,
  validId,
  approvedVersion,
  approvedVisibleListingQuery,
  snapshot,
  readAddress,
  paymentReadyToShip,
  paymentReadyToReceive,
} = require("../domain/commerceRules");

function requireBuyerSellerAccess(req, res, next) {
  if (req.user.role !== "USER") {
    return failure(req, res, 404, "NOT_FOUND", "Không tìm thấy tài nguyên.");
  }
  return next();
}

const buyerOnly = [requireAuth, requireBuyerSellerAccess, requireVerifiedEmail];
const checkoutStatuses = [
  "OPEN", "COMPLETED", "PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "EXPIRED",
  "CANCELLED", "CONFIRMED", "NEEDS_REVIEW",
];
const orderStatuses = [
  "PLACED", "PENDING", "CONFIRMED", "PAID", "PAYMENT_FAILED", "EXPIRED",
  "CANCELLED", "NEEDS_REVIEW", "RETURNED", "COMPLETED",
];

function emptyBody(req) {
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
    throw problem(422, "VALIDATION_ERROR", "Request body phải rỗng.");
  }
}

function readCheckoutInput(body) {
  const allowed = new Set([
    "items", "recipientName", "paymentMethod", "recipientPhone", "recipientAddress",
  ]);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !allowed.has(key))) {
    throw problem(422, "VALIDATION_ERROR", "Body Checkout chứa trường không được hỗ trợ.");
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw problem(422, "VALIDATION_ERROR", "Checkout cần từ 1 đến 20 món.");
  }
  const items = body.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some((key) => !["listingId", "expectedPrice", "expectedVersionId"].includes(key)) ||
        !validId(item.listingId) || !validId(item.expectedVersionId) ||
        !Number.isSafeInteger(item.expectedPrice) || item.expectedPrice < 1) {
      throw problem(422, "VALIDATION_ERROR", "Thông tin món hoặc giá xác nhận không hợp lệ.");
    }
    return {
      listingId: item.listingId.toLowerCase(),
      expectedPrice: item.expectedPrice,
      expectedVersionId: item.expectedVersionId.toLowerCase(),
    };
  }).sort((a, b) => a.listingId.localeCompare(b.listingId));
  if (new Set(items.map((item) => item.listingId)).size !== items.length) {
    throw problem(422, "DUPLICATE_ITEM", "Danh sách có món trùng.");
  }
  if (body.paymentMethod !== "COD") {
    throw problem(422, "PAYMENT_METHOD_UNAVAILABLE", "Hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).");
  }
  const shippingAddress = readAddress({
    fullName: body.recipientName,
    phone: body.recipientPhone,
    address: body.recipientAddress,
  });
  return { items, shippingAddress, paymentMethod: body.paymentMethod };
}

function readPagination(query, allowed, statuses) {
  if (Object.keys(query).some((key) => !allowed.includes(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }
  if (query.status !== undefined && !statuses.includes(query.status)) return null;
  return { page, limit, status: query.status };
}

function checkoutDTO(checkout, orders = []) {
  return {
    checkoutId: String(checkout._id),
    paymentMethod: checkout.paymentMethod,
    status: checkout.status,
    paymentStatus: checkout.paymentStatus,
    subtotal: checkout.subtotal,
    shippingFee: checkout.shippingFee,
    totalAmount: checkout.total,
    currency: checkout.currency,
    expiresAt: checkout.expiresAt,
    orderIds: orders.map((order) => String(order._id)),
    createdAt: checkout.createdAt,
  };
}

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
  const listingIds = orders.flatMap((order) => order.items.map((item) => item.listingId));
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [collections, returnRequests, listings, cases] = await Promise.all([
    collectionsPromise,
    returnsPromise,
    Listing.find({ _id: { $in: listingIds } }).select("ownerId saleStatus soldCheckoutId paymentReviewHold paymentReviewCheckoutIds"),
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
        { $match: { caseId: { $in: activeCases.map((record) => record._id) } } },
        { $group: { _id: "$caseId", count: { $sum: 1 } } },
      ])
    : [];
  const collectionByOrder = new Map(collections.map((collection) => [String(collection.orderId), collection]));
  const returnByOrder = new Map(returnRequests.map((request) => [String(request.orderId), request]));
  const listingById = new Map(listings.map((listing) => [String(listing._id), listing]));
  const activeCaseByOrder = new Map(activeCases.map((record) => [String(record.targetId), record]));
  const recentClosedCases = new Set(cases
    .filter((record) => record.status === "CLOSED")
    .map((record) => `${record.targetId}:${record.type}`));
  const complaintCountByCase = new Map(complaintCounts.map((record) => [String(record._id), record.count]));

  return new Map(orders.map((order) => {
    const items = order.items.map((item) => listingById.get(String(item.listingId)));
    const collection = collectionByOrder.get(String(order._id));
    const returnRequest = returnByOrder.get(String(order._id));
    const activeCase = activeCaseByOrder.get(String(order._id));
    const validCollection = order.paymentStatus !== "COLLECTED" || Boolean(
      order.shippedAt && collection &&
      String(collection._id) === String(order.codCollectionId) &&
      String(collection.buyerId) === String(order.buyerId) &&
      String(collection.sellerId) === String(order.sellerId) &&
      collection.amount === order.total && collection.currency === order.currency,
    );
    const financiallySafe = Boolean(!order.paymentReviewHold && order.paymentStatus !== "NEEDS_REVIEW" &&
      items.length === order.items.length &&
      items.every((listing, index) => listing &&
        String(order.items[index].sellerId) === String(order.sellerId) &&
        String(listing.ownerId) === String(order.sellerId) && listing.saleStatus === "SOLD" &&
        String(listing.soldCheckoutId) === String(order.checkoutId) &&
        !listing.paymentReviewHold && (listing.paymentReviewCheckoutIds || []).length === 0));
    const canFulfill = financiallySafe && validCollection && paymentReadyToReceive(order) && !activeCase;
    const canAddComplaint = (type) => activeCase
      ? activeCase.type === type && (complaintCountByCase.get(String(activeCase._id)) || 0) < 3
      : !recentClosedCases.has(`${order._id}:${type}`);
    const returnException = order.paymentMethod === "COD" &&
      order.status === "NEEDS_REVIEW" && order.paymentStatus === "UNPAID" &&
      Boolean(order.shippedAt) && !order.receivedAt && !order.codCollectionId &&
      ["OPEN", "REJECTED"].includes(returnRequest?.status) &&
      String(returnRequest?.orderId) === String(order._id);
    const canComplainDelivery = financiallySafe && !order.receivedAt && canAddComplaint("DELIVERY") && (
      (order.paymentMethod === "COD" && order.status === "CONFIRMED" &&
        ["UNPAID", "COLLECTED"].includes(order.paymentStatus) &&
        (order.paymentStatus !== "COLLECTED" || (order.shippedAt && validCollection))) ||
      returnException
    );
    const canComplainItem = financiallySafe && order.status === "COMPLETED" && Boolean(order.receivedAt) &&
      canAddComplaint("ITEM") && (
        (order.paymentMethod === "COD" && ["UNPAID", "COLLECTED"].includes(order.paymentStatus) && validCollection)
      );
    return [String(order._id), { canFulfill, canComplainDelivery, canComplainItem }];
  }));
}

async function orderDTOs(orders, viewerId) {
  const collectionsPromise = CodCollection.find({ orderId: { $in: orders.map((order) => order._id) } }).exec();
  const returnsPromise = CodReturnRequest.find({ orderId: { $in: orders.map((order) => order._id) } }).exec();
  const quotaPromise = ComplaintQuota.findOne({ buyerId: viewerId }).select("recentSubmissions").lean();
  const [fulfillment, collections, returns, quota] = await Promise.all([
    fulfillmentByOrder(orders, collectionsPromise, returnsPromise),
    collectionsPromise,
    returnsPromise,
    quotaPromise,
  ]);
  const quotaAvailable = (quota?.recentSubmissions || []).filter(
    (submittedAt) => submittedAt.getTime() > Date.now() - 24 * 60 * 60 * 1000,
  ).length < 5;
  const collectionByOrder = new Map(collections.map((collection) => [String(collection.orderId), collection]));
  const returnByOrder = new Map(returns.map((record) => [String(record.orderId), record]));
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
      ...(mayReadAddress ? { shippingAddress: shippingAddressDTO(order.shippingAddress) } : {}),
      canFulfill: canFulfillOrder,
      canShip: !buyer && canFulfillOrder && paymentReadyToShip(order) && !order.shippedAt,
      canConfirmReceipt: buyer && canFulfillOrder && paymentReadyToReceive(order) &&
        Boolean(order.shippedAt) && !order.receivedAt,
      canComplainDelivery: buyer && quotaAvailable && Boolean(capabilities.canComplainDelivery),
      canComplainItem: buyer && quotaAvailable && Boolean(capabilities.canComplainItem),
      carrierName: order.carrierName,
      trackingCode: order.trackingCode,
      shippedAt: order.shippedAt,
      receivedAt: order.receivedAt,
      codCollection: collection ? {
        amount: collection.amount,
        currency: collection.currency,
        source: collection.source,
        recordedAt: collection.recordedAt,
      } : null,
      codReturnRequest: returnRequest ? {
        requestId: String(returnRequest._id),
        status: returnRequest.status,
        reason: returnRequest.reason,
        trackingCode: returnRequest.trackingCode,
        decisionReason: returnRequest.decisionReason,
        decidedAt: returnRequest.decidedAt,
      } : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  });
}

function requireLoginForDiscoveryFilters(req, res, next) {
  const hasFilters = ["q", "category", "size", "condition", "minPrice", "maxPrice"]
    .some((key) => req.query[key] !== undefined);
  return hasFilters ? requireAuth(req, res, next) : next();
}

function discoveryPipeline({ page, limit, filters }) {
  return [
    { $match: approvedVisibleListingQuery({ saleStatus: "AVAILABLE" }) },
    {
      $addFields: {
        approvedVersion: {
          $first: {
            $filter: {
              input: { $ifNull: ["$versions", []] },
              as: "version",
              cond: { $eq: ["$$version._id", "$approvedVersionId"] },
            },
          },
        },
      },
    },
    { $match: { "approvedVersion.status": "APPROVED", ...filters } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              listingId: "$_id",
              versionId: "$approvedVersion._id",
              sellerId: "$ownerId",
              title: "$approvedVersion.title",
              category: "$approvedVersion.category",
              size: "$approvedVersion.size",
              condition: "$approvedVersion.condition",
              price: "$approvedVersion.price",
              imageIds: "$approvedVersion.imageIds",
              saleStatus: 1,
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];
}

function checkId(value) {
  if (!validId(value)) {
    throw problem(422, "INVALID_ID", "ID không hợp lệ.");
  }
}

async function ensureCart(buyerId) {
  try {
    return await Cart.findOneAndUpdate(
      { buyerId },
      { $setOnInsert: { listingIds: [] } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    // Hai request có thể cùng tạo giỏ đầu tiên của một Buyer.
    if (error.code !== 11000) throw error;
    return Cart.findOne({ buyerId });
  }
}

// Danh sách tin đã duyệt và có thể mua.
router.get("/listings", requireLoginForDiscoveryFilters, async (req, res) => {
  const query = readDiscoveryQuery(req.query);
  if (!query) throw problem(422, "VALIDATION_ERROR", "Tham số tìm kiếm hoặc phân trang không hợp lệ.");
  const [result] = await Listing.aggregate(discoveryPipeline(query));
  return success(req, res, result?.items || [], 200, {
    page: query.page,
    limit: query.limit,
    total: result?.total?.[0]?.count || 0,
    serverNow: new Date().toISOString(),
  });
});

router.get("/listings/:id", async (req, res) => {
  checkId(req.params.id);
  const listing = await Listing.findById(req.params.id);
  const version = approvedVersion(listing);
  if (!listing || !version || !["AVAILABLE", "RESERVED", "SOLD"].includes(listing.saleStatus)) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy tin.");
  }

  return success(req, res, {
    listingId: String(listing._id),
    versionId: String(version._id),
    sellerId: String(listing.ownerId),
    title: version.title,
    category: version.category,
    size: version.size,
    condition: version.condition,
    description: version.description,
    flaws: version.flaws,
    price: version.price,
    shipFrom: version.shipFrom,
    imageIds: version.imageIds,
    saleStatus: listing.saleStatus,
    canBuy: listing.saleStatus === "AVAILABLE",
    watermark: listing.saleStatus === "SOLD" ? "Đã bán" : null,
    createdAt: listing.createdAt,
  }, 200, { serverNow: new Date().toISOString() });
});

router.get("/cart", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  const cart = await ensureCart(req.user._id);

  const listings = await Listing.find({
    _id: { $in: cart.listingIds },
  });

  const byId = new Map(
    listings.map((listing) => [String(listing._id), listing]),
  );

  const items = cart.listingIds.map((listingId) => {
    const listing = byId.get(String(listingId));

    if (!approvedVersion(listing)) {
      return { listingId, availability: "UNAVAILABLE" };
    }

    return {
      ...snapshot(listing),
      availability: listing.saleStatus,
    };
  });

  return success(req, res, { items }, 200, {
    serverNow: new Date().toISOString(),
  });
});

router.post("/cart/items", ...buyerOnly, async (req, res) => {
  const listingId = req.body?.listingId;
  checkId(listingId);

  const listing = await Listing.findById(listingId);

  if (!approvedVersion(listing) || listing.saleStatus !== "AVAILABLE") {
    throw problem(
      409,
      "LISTING_UNAVAILABLE",
      "Món đã bán, đang được giữ hoặc chưa được duyệt.",
    );
  }

  if (String(listing.ownerId) === String(req.user._id)) {
    throw problem(422, "OWN_LISTING", "Không thể mua món của chính mình.");
  }

  await ensureCart(req.user._id);

  const cart = await Cart.findOneAndUpdate(
    { buyerId: req.user._id },
    { $addToSet: { listingIds: listing._id } },
    { returnDocument: "after" },
  );

  return success(req, res, cart, 200, { serverNow: new Date().toISOString() });
});

router.delete("/cart/items/:id", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  checkId(req.params.id);

  await Cart.updateOne(
    { buyerId: req.user._id },
    { $pull: { listingIds: req.params.id } },
  );

  return success(req, res, { removed: true }, 200, {
    serverNow: new Date().toISOString(),
  });
});

router.post("/checkouts", ...buyerOnly, async (req, res) => {
  const input = readCheckoutInput(req.body);
  const requestKey = readIdempotencyKey(req);
  const idempotencyFingerprint = fingerprint({
    items: input.items,
    shippingAddress: input.shippingAddress,
    paymentMethod: input.paymentMethod,
  });
  const result = await createCheckout({
    buyerId: req.user._id,
    requestKey,
    idempotencyFingerprint,
    ...input,
    requestId: req.requestId,
  });
  return success(req, res, checkoutDTO(result.checkout, result.orders), result.reused ? 200 : 201, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.get("/me/checkouts", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  const page = readPagination(req.query, ["status", "page", "limit"], checkoutStatuses);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  const filter = { buyerId: req.user._id, ...(page.status ? { status: page.status } : {}) };
  const [checkouts, total] = await Promise.all([
    Checkout.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page.page - 1) * page.limit).limit(page.limit),
    Checkout.countDocuments(filter),
  ]);
  const orders = await Order.find({ checkoutId: { $in: checkouts.map((checkout) => checkout._id) } })
    .sort({ sellerId: 1 });
  const ordersByCheckout = new Map();
  for (const order of orders) {
    const key = String(order.checkoutId);
    if (!ordersByCheckout.has(key)) ordersByCheckout.set(key, []);
    ordersByCheckout.get(key).push(order);
  }
  return success(req, res, checkouts.map((checkout) => checkoutDTO(checkout, ordersByCheckout.get(String(checkout._id)) || [])), 200, {
    page: page.page,
    limit: page.limit,
    total,
    serverNow: new Date().toISOString(),
  });
});

router.get("/checkouts/:id", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  checkId(req.params.id);
  const checkout = await Checkout.findOne({
    _id: req.params.id,
    buyerId: req.user._id,
  });

  if (!checkout) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  }
  const orders = await Order.find({ checkoutId: checkout._id }).sort({ sellerId: 1 });
  const orderData = await orderDTOs(orders, req.user._id);
  const now = new Date();
  return success(req, res, {
    ...checkoutDTO(checkout, orders),
    orders: orderData,
  }, 200, { serverNow: now.toISOString() });
});

router.get("/checkouts/:id/payment", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  checkId(req.params.id);
  const checkout = await Checkout.findOne({ _id: req.params.id, buyerId: req.user._id });
  if (!checkout) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  const orders = await Order.find({ checkoutId: checkout._id }).sort({ sellerId: 1 });
  const collections = await CodCollection.find({ orderId: { $in: orders.map((order) => order._id) } });
  const byOrder = new Map(collections.map((collection) => [String(collection.orderId), collection]));
  return success(req, res, {
      paymentMethod: "COD",
      attemptId: null,
      paymentStatus: checkout.paymentStatus,
      checkoutStatus: checkout.status,
      amount: checkout.total,
      collectibleAmount: checkout.collectibleAmount,
      collectedAmount: checkout.collectedAmount,
      outstandingAmount: checkout.outstandingAmount,
      currency: checkout.currency,
      needsReview: checkout.paymentStatus === "NEEDS_REVIEW",
      orders: orders.map((order) => {
        const collection = byOrder.get(String(order._id));
        return {
          orderId: String(order._id),
          sellerId: String(order.sellerId),
          amount: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          collection: collection ? {
            source: collection.source,
            amount: collection.amount,
            recordedAt: collection.recordedAt,
          } : null,
        };
      }),
  }, 200, { serverNow: new Date().toISOString() });
});

router.post("/checkouts/:id/confirm", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  throw problem(410, "ENDPOINT_RETIRED", "Checkout được xác nhận khi tạo; không nhận lệnh confirm từ client.");
});

router.get("/me/orders", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  const perspective = req.query.perspective ?? "buying";
  if (!["buying", "selling"].includes(perspective)) {
    throw problem(422, "VALIDATION_ERROR", "perspective phải là buying hoặc selling.");
  }
  const page = readPagination(req.query, ["perspective", "status", "page", "limit"], orderStatuses);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  const filter = {
    [perspective === "buying" ? "buyerId" : "sellerId"]: req.user._id,
    ...(page.status ? { status: page.status } : {}),
  };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page.page - 1) * page.limit).limit(page.limit),
    Order.countDocuments(filter),
  ]);
  return success(req, res, await orderDTOs(orders, req.user._id), 200, {
    perspective, page: page.page, limit: page.limit, total, serverNow: new Date().toISOString(),
  });
});

router.get("/me/sales", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  const page = readPagination(req.query, ["status", "page", "limit"], orderStatuses);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  const filter = { sellerId: req.user._id, ...(page.status ? { status: page.status } : {}) };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page.page - 1) * page.limit).limit(page.limit),
    Order.countDocuments(filter),
  ]);
  return success(req, res, await orderDTOs(orders, req.user._id), 200, {
    perspective: "selling", page: page.page, limit: page.limit, total, serverNow: new Date().toISOString(),
  });
});

router.get("/orders/:id", requireAuth, requireBuyerSellerAccess, async (req, res) => {
  checkId(req.params.id);
  const order = await Order.findOne({
    _id: req.params.id,
    $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
  });
  if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const [data] = await orderDTOs([order], req.user._id);
  return success(req, res, data, 200, { serverNow: new Date().toISOString() });
});

router.post("/orders/:id/complaints", ...buyerOnly, async (req, res) => {
  if (!validId(req.params.id)) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const input = readComplaintInput(req.body);
  if (!input) throw problem(422, "VALIDATION_ERROR", "Dữ liệu khiếu nại không hợp lệ.");
  const idempotencyKey = readIdempotencyKey(req);
  let result;
  try {
    result = await createComplaint({
      orderId: req.params.id,
      buyerId: req.user._id,
      requestId: req.requestId,
      idempotencyKey,
      input,
    });
  } catch (error) {
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    throw error;
  }
  return success(req, res, result.receipt, result.reused ? 200 : 201, {
    idempotentReplay: result.reused,
  });
});

router.get("/orders/:id/complaints", ...buyerOnly, async (req, res) => {
  if (!validId(req.params.id)) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const page = readPagination(
    req.query,
    ["type", "status", "page", "limit"],
    ["OPEN", "IN_REVIEW", "CLOSED"],
  );
  if (!page || (req.query.type !== undefined && !["DELIVERY", "ITEM"].includes(req.query.type))) {
    throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  }
  const result = await listBuyerComplaints({
    orderId: req.params.id,
    buyerId: req.user._id,
    page: page.page,
    limit: page.limit,
    type: req.query.type,
    status: page.status,
  });
  res.set("Cache-Control", "private, no-store");
  return success(req, res, result.items, 200, {
    page: page.page,
    limit: page.limit,
    total: result.total,
  });
});

router.get("/orders/:id/complaints/:complaintId", ...buyerOnly, async (req, res) => {
  if (!validId(req.params.id) || !validId(req.params.complaintId)) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy khiếu nại.");
  }
  const data = await getBuyerComplaint({
    orderId: req.params.id,
    complaintId: req.params.complaintId,
    buyerId: req.user._id,
  });
  res.set("Cache-Control", "private, no-store");
  return success(req, res, data);
});

router.post("/orders/:id/cancel", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  emptyBody(req);
  readIdempotencyKey(req);
  const result = await cancelCodOrder({
    orderId: req.params.id,
    buyerId: req.user._id,
    requestId: req.requestId,
  });
  const [data] = await orderDTOs([result.order], req.user._id);
  return success(req, res, data, 200, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.put("/orders/:id/shipment", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["carrierName", "trackingCode"].includes(key)) ||
      typeof body.carrierName !== "string" || typeof body.trackingCode !== "string") {
    throw problem(422, "VALIDATION_ERROR", "Thông tin vận đơn không hợp lệ.");
  }
  const carrierName = body.carrierName.trim();
  const trackingCode = body.trackingCode.trim();
  if (carrierName.length < 2 || carrierName.length > 100 ||
      trackingCode.length < 3 || trackingCode.length > 100 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(carrierName) ||
      /[\u0000-\u001f\u007f-\u009f]/.test(trackingCode)) {
    throw problem(422, "VALIDATION_ERROR", "Tên đơn vị vận chuyển hoặc mã vận đơn không hợp lệ.");
  }
  const result = await markOrderShipped({
    orderId: req.params.id,
    sellerId: req.user._id,
    carrierName,
    trackingCode,
    requestId: req.requestId,
  });
  const [data] = await orderDTOs([result.order], req.user._id);
  return success(req, res, data, 200, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.post("/orders/:id/receipt-confirmation", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  emptyBody(req);
  readIdempotencyKey(req);
  const result = await confirmOrderReceipt({
    orderId: req.params.id,
    buyerId: req.user._id,
    requestId: req.requestId,
  });
  const [data] = await orderDTOs([result.order], req.user._id);
  return success(req, res, data, 200, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.post("/orders/:id/cod-collection", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["amount", "note"].includes(key)) ||
      !Number.isSafeInteger(body.amount) || body.amount < 1 ||
      (body.note !== undefined && typeof body.note !== "string")) {
    throw problem(422, "VALIDATION_ERROR", "Số tiền hoặc ghi chú thu COD không hợp lệ.");
  }
  const note = (body.note || "").trim();
  if (note.length > 1000) throw problem(422, "VALIDATION_ERROR", "Ghi chú tối đa 1000 ký tự.");
  const idempotencyKey = readIdempotencyKey(req);
  const idempotencyFingerprint = fingerprint({
    operation: "COD_COLLECTION", orderId: req.params.id, amount: body.amount, note,
  });
  const result = await recordCodCollection({
    orderId: req.params.id,
    sellerId: req.user._id,
    amount: body.amount,
    note,
    requestId: req.requestId,
    idempotencyKey,
    idempotencyFingerprint,
  });
  const collection = result.collection;
  return success(req, res, {
    collectionId: String(collection._id),
    orderId: String(collection.orderId),
    amount: collection.amount,
    currency: collection.currency,
    source: collection.source,
    recordedAt: collection.recordedAt,
  }, result.reused ? 200 : 201, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.get("/admin/cod-collections", requireAuth, requireAdmin, async (req, res) => {
  if (Object.keys(req.query).some((key) => !["orderId", "sellerId", "page", "limit"].includes(key)) ||
      (req.query.orderId !== undefined && !validId(req.query.orderId)) ||
      (req.query.sellerId !== undefined && !validId(req.query.sellerId))) {
    throw problem(422, "VALIDATION_ERROR", "Bộ lọc COD không hợp lệ.");
  }
  const page = readPagination(req.query, ["orderId", "sellerId", "page", "limit"], []);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  const filter = {
    ...(req.query.orderId ? { orderId: req.query.orderId } : {}),
    ...(req.query.sellerId ? { sellerId: req.query.sellerId } : {}),
  };
  const [collections, total] = await Promise.all([
    CodCollection.find(filter).sort({ recordedAt: -1, _id: -1 })
      .skip((page.page - 1) * page.limit).limit(page.limit),
    CodCollection.countDocuments(filter),
  ]);
  if (collections.length) {
    await AuditEvent.create(collections.map((collection) => ({
      actorId: req.user._id,
      action: "COD_COLLECTION_LOOKUP_READ",
      targetType: "COD_COLLECTION",
      targetId: collection._id,
      requestId: req.requestId,
      fromState: "RECORDED",
      toState: "RECORDED",
    })));
  }
  return success(req, res, collections.map((collection) => ({
    collectionId: String(collection._id),
    orderId: String(collection.orderId),
    buyerId: String(collection.buyerId),
    sellerId: String(collection.sellerId),
    amount: collection.amount,
    currency: collection.currency,
    source: collection.source,
    recordedAt: collection.recordedAt,
    requestId: collection.requestId,
  })), 200, {
    page: page.page,
    limit: page.limit,
    total,
    serverNow: new Date().toISOString(),
  });
});

router.post("/orders/:id/cod-return-requests", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "reason") || typeof body.reason !== "string") {
    throw problem(422, "VALIDATION_ERROR", "Yêu cầu cần có reason hợp lệ.");
  }
  const reason = body.reason.trim();
  if (reason.length < 10 || reason.length > 2000) {
    throw problem(422, "VALIDATION_ERROR", "reason cần từ 10 đến 2000 ký tự.");
  }
  const idempotencyKey = readIdempotencyKey(req);
  const idempotencyFingerprint = fingerprint({
    operation: "COD_RETURN_REQUEST", orderId: req.params.id, reason,
  });
  const result = await requestCodReturn({
    orderId: req.params.id,
    sellerId: req.user._id,
    reason,
    requestId: req.requestId,
    idempotencyKey,
    idempotencyFingerprint,
  });
  const record = result.returnRequest;
  return success(req, res, {
    requestId: String(record._id),
    orderId: String(record.orderId),
    status: record.status,
    reason: record.reason,
    trackingCode: record.trackingCode,
    createdAt: record.createdAt,
  }, result.reused ? 200 : 201, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.get("/admin/cod-return-requests", requireAuth, requireAdmin, async (req, res) => {
  const statuses = ["OPEN", "ACCEPTED", "REJECTED"];
  const page = readPagination(req.query, ["status", "page", "limit"], statuses);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  const filter = page.status ? { status: page.status } : {};
  const [records, total] = await Promise.all([
    CodReturnRequest.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page.page - 1) * page.limit)
      .limit(page.limit),
    CodReturnRequest.countDocuments(filter),
  ]);
  const orders = await Order.find({ _id: { $in: records.map((record) => record.orderId) } })
    .select("buyerId sellerId status paymentStatus currency total trackingCode shippedAt items");
  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  const data = records.map((record) => {
    const order = orderById.get(String(record.orderId));
    return {
      requestId: String(record._id),
      orderId: String(record.orderId),
      buyerId: String(record.buyerId),
      sellerId: String(record.sellerId),
      status: record.status,
      reason: record.reason,
      trackingCode: record.trackingCode,
      decisionReason: record.decisionReason,
      decidedAt: record.decidedAt,
      createdAt: record.createdAt,
      order: order ? {
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        currency: order.currency,
        trackingCode: order.trackingCode,
        shippedAt: order.shippedAt,
        items: order.items.map((item) => ({
          listingId: String(item.listingId),
          title: item.title,
          price: item.price,
        })),
      } : null,
    };
  });
  if (records.length) {
    await AuditEvent.create(records.map((record) => ({
      actorId: req.user._id,
      action: "COD_RETURN_LOOKUP_READ",
      targetType: "COD_RETURN_REQUEST",
      targetId: record._id,
      requestId: req.requestId,
      fromState: record.status,
      toState: record.status,
    })));
  }
  return success(req, res, data, 200, {
    page: page.page,
    limit: page.limit,
    total,
    serverNow: new Date().toISOString(),
  });
});

router.post("/admin/orders/:id/cod-return-decisions", requireAuth, requireAdmin, async (req, res) => {
  checkId(req.params.id);
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["requestId", "decision", "reason"].includes(key)) ||
      !validId(body.requestId) || !["ACCEPT_RETURN", "REJECT_RETURN"].includes(body.decision) ||
      typeof body.reason !== "string") {
    throw problem(422, "VALIDATION_ERROR", "Quyết định hoàn COD không hợp lệ.");
  }
  const reason = body.reason.trim();
  if (reason.length < 10 || reason.length > 2000) {
    throw problem(422, "VALIDATION_ERROR", "reason cần từ 10 đến 2000 ký tự.");
  }
  const idempotencyKey = readIdempotencyKey(req);
  const idempotencyFingerprint = fingerprint({
    operation: "COD_RETURN_DECISION",
    orderId: req.params.id,
    returnRequestId: body.requestId,
    decision: body.decision,
    reason,
  });
  const result = await decideCodReturn({
    orderId: req.params.id,
    adminId: req.user._id,
    requestId: req.requestId,
    returnRequestId: body.requestId,
    decision: body.decision,
    reason,
    idempotencyKey,
    idempotencyFingerprint,
  });
  const record = result.returnRequest;
  return success(req, res, {
    requestId: String(record._id),
    orderId: String(record.orderId),
    status: record.status,
    decisionReason: record.decisionReason,
    decidedAt: record.decidedAt,
  }, 200, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

module.exports = router;
