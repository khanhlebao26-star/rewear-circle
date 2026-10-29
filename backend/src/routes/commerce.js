const router = require("express").Router();
const Listing = require("../models/Listing");
const Case = require("../models/Case");
const AuditEvent = require("../models/AuditEvent");
const {
  Cart,
  Checkout,
  Order,
  PaymentAttempt,
  PaymentEvent,
  CodCollection,
  CodReturnRequest,
} = require("../models/commerce");
const { createCheckout, cancelVnpayCheckout } = require("../services/checkout");
const { createPaymentAttempt } = require("../services/paymentAttempts");
const {
  cancelCodOrder,
  recordCodCollection,
  requestCodReturn,
  decideCodReturn,
  markOrderShipped,
  confirmOrderReceipt,
} = require("../services/codOrders");
const { success } = require("../http/responses");
const { readDiscoveryQuery } = require("../domain/discoveryRules");
const { readIdempotencyKey, fingerprint } = require("../domain/idempotency");
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
} = require("../domain/commerceRules");

const buyerOnly = [requireAuth, requireVerifiedEmail];
const checkoutStatuses = [
  "OPEN", "COMPLETED", "PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "EXPIRED",
  "CANCELLED", "CONFIRMED", "NEEDS_REVIEW",
];
const orderStatuses = [
  "PLACED", "PENDING", "CONFIRMED", "PAID", "PAYMENT_FAILED", "EXPIRED",
  "CANCELLED", "NEEDS_REVIEW", "RETURNED", "COMPLETED",
];
const paymentStatuses = ["INITIATED", "PENDING", "SUCCESS", "FAILED", "EXPIRED", "NEEDS_REVIEW"];

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
  if (!["COD", "VNPAY"].includes(body.paymentMethod)) {
    throw problem(422, "VALIDATION_ERROR", "paymentMethod phải là COD hoặc VNPAY.");
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

async function fulfillmentByOrder(orders) {
  if (!orders.length) return new Map();
  const orderIds = orders.map((order) => order._id);
  const listingIds = orders.flatMap((order) => order.items.map((item) => item.listingId));
  const [listings, cases] = await Promise.all([
    Listing.find({ _id: { $in: listingIds } }).select("saleStatus soldCheckoutId paymentReviewHold paymentReviewCheckoutIds"),
    Case.find({ targetType: "ORDER", targetId: { $in: orderIds }, status: { $in: ["OPEN", "IN_REVIEW"] } })
      .select("targetId"),
  ]);
  const listingById = new Map(listings.map((listing) => [String(listing._id), listing]));
  const casesByOrder = new Set(cases.map((record) => String(record.targetId)));
  return new Map(orders.map((order) => {
    const items = order.items.map((item) => listingById.get(String(item.listingId)));
    const stateAllowsFulfillment =
      (order.paymentMethod === "COD" && order.status === "CONFIRMED") ||
      (order.paymentMethod === "VNPAY" && order.status === "PAID");
    const canFulfill = Boolean(
      stateAllowsFulfillment &&
      !order.paymentReviewHold &&
      !casesByOrder.has(String(order._id)) &&
      items.length === order.items.length &&
      items.every((listing) => listing && listing.saleStatus === "SOLD" &&
        String(listing.soldCheckoutId) === String(order.checkoutId) &&
        !listing.paymentReviewHold && listing.paymentReviewCheckoutIds.length === 0),
    );
    return [String(order._id), canFulfill];
  }));
}

async function orderDTOs(orders, viewerId) {
  const [canFulfill, collections, returns] = await Promise.all([
    fulfillmentByOrder(orders),
    CodCollection.find({ orderId: { $in: orders.map((order) => order._id) } }),
    CodReturnRequest.find({ orderId: { $in: orders.map((order) => order._id) } }),
  ]);
  const collectionByOrder = new Map(collections.map((collection) => [String(collection.orderId), collection]));
  const returnByOrder = new Map(returns.map((record) => [String(record.orderId), record]));
  return orders.map((order) => {
    const buyer = String(order.buyerId) === String(viewerId);
    const mayReadAddress = buyer || canFulfill.get(String(order._id));
    const collection = collectionByOrder.get(String(order._id));
    const returnRequest = returnByOrder.get(String(order._id));
    return {
      orderId: String(order._id),
      checkoutId: String(order.checkoutId),
      buyerId: String(order.buyerId),
      sellerId: String(order.sellerId),
      items: order.items,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentReviewHold: order.paymentReviewHold,
      paymentReviewReason: order.paymentReviewReason,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      ...(mayReadAddress ? { shippingAddress: order.shippingAddress } : {}),
      canFulfill: Boolean(canFulfill.get(String(order._id))),
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

router.get("/cart", requireAuth, async (req, res) => {
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

router.delete("/cart/items/:id", requireAuth, async (req, res) => {
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

router.get("/me/checkouts", requireAuth, async (req, res) => {
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

router.get("/checkouts/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);
  const checkout = await Checkout.findOne({
    _id: req.params.id,
    buyerId: req.user._id,
  });

  if (!checkout) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  }
  const [orders, attempt] = await Promise.all([
    Order.find({ checkoutId: checkout._id }).sort({ sellerId: 1 }),
    PaymentAttempt.findOne({ checkoutId: checkout._id }).select("_id status expiresAt verifiedAt"),
  ]);
  const orderData = await orderDTOs(orders, req.user._id);
  const now = new Date();
  const isPending = checkout.paymentMethod === "VNPAY" && checkout.status === "PENDING_PAYMENT" && checkout.expiresAt > now;
  return success(req, res, {
    ...checkoutDTO(checkout, orders),
    orders: orderData,
    attemptId: attempt ? String(attempt._id) : null,
    canPay: Boolean(isPending),
    canCancel: Boolean(isPending && !attempt),
  }, 200, { serverNow: now.toISOString() });
});

router.get("/checkouts/:id/payment", requireAuth, async (req, res) => {
  checkId(req.params.id);
  const checkout = await Checkout.findOne({ _id: req.params.id, buyerId: req.user._id });
  if (!checkout) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  if (checkout.paymentMethod === "COD") {
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
  }
  const attempt = await PaymentAttempt.findOne({ checkoutId: checkout._id })
    .select("_id status amount currency expiresAt verifiedAt responseCode transactionStatus");
  return success(req, res, {
    paymentMethod: "VNPAY",
    attemptId: attempt ? String(attempt._id) : null,
    status: attempt?.status || "NOT_STARTED",
    paymentStatus: checkout.paymentStatus,
    checkoutStatus: checkout.status,
    amount: checkout.total,
    currency: checkout.currency,
    expiresAt: checkout.expiresAt,
    verifiedAt: attempt?.verifiedAt || null,
    needsReview: checkout.status === "NEEDS_REVIEW" || attempt?.status === "NEEDS_REVIEW",
  }, 200, { serverNow: new Date().toISOString() });
});

router.get("/admin/payments", requireAuth, requireAdmin, async (req, res) => {
  const allowed = ["orderId", "providerReference", "status", "page", "limit"];
  if (Object.keys(req.query).some((key) => !allowed.includes(key)) ||
      (req.query.orderId !== undefined && !validId(req.query.orderId)) ||
      (req.query.providerReference !== undefined &&
        (typeof req.query.providerReference !== "string" || req.query.providerReference.length < 1 || req.query.providerReference.length > 100))) {
    throw problem(422, "VALIDATION_ERROR", "Bộ lọc thanh toán không hợp lệ.");
  }
  const page = readPagination(req.query, allowed, paymentStatuses);
  if (!page) throw problem(422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
  let checkoutIds;
  if (req.query.orderId) {
    const order = await Order.findById(req.query.orderId).select("checkoutId");
    checkoutIds = order ? [order.checkoutId] : [];
  }
  const filter = {
    ...(req.query.providerReference ? { merchantReference: req.query.providerReference } : {}),
    ...(page.status ? { status: page.status } : {}),
    ...(checkoutIds ? { checkoutId: { $in: checkoutIds } } : {}),
  };
  const [attempts, total] = await Promise.all([
    PaymentAttempt.find(filter).sort({ createdAt: -1, _id: -1 })
      .skip((page.page - 1) * page.limit).limit(page.limit),
    PaymentAttempt.countDocuments(filter),
  ]);
  const [checkouts, orders] = await Promise.all([
    Checkout.find({ _id: { $in: attempts.map((attempt) => attempt.checkoutId) } }).select("status paymentStatus total currency paymentMethod"),
    Order.find({ checkoutId: { $in: attempts.map((attempt) => attempt.checkoutId) } }).select("_id checkoutId sellerId status paymentStatus total currency"),
  ]);
  const checkoutById = new Map(checkouts.map((checkout) => [String(checkout._id), checkout]));
  const ordersByCheckout = new Map();
  for (const order of orders) {
    const key = String(order.checkoutId);
    if (!ordersByCheckout.has(key)) ordersByCheckout.set(key, []);
    ordersByCheckout.get(key).push(order);
  }
  if (attempts.length) {
    await AuditEvent.create(attempts.map((attempt) => ({
      actorId: req.user._id,
      action: "PAYMENT_LOOKUP_READ",
      targetType: "PAYMENT_ATTEMPT",
      targetId: attempt._id,
      requestId: req.requestId,
      fromState: attempt.status,
      toState: attempt.status,
    })));
  }
  return success(req, res, attempts.map((attempt) => {
    const checkout = checkoutById.get(String(attempt.checkoutId));
    return {
      attemptId: String(attempt._id),
      checkoutId: String(attempt.checkoutId),
      buyerId: String(attempt.buyerId),
      provider: attempt.provider,
      providerReference: attempt.merchantReference,
      providerTransactionNo: attempt.providerTransactionNo || null,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      expiresAt: attempt.expiresAt,
      verifiedAt: attempt.verifiedAt,
      responseCode: attempt.responseCode,
      transactionStatus: attempt.transactionStatus,
      reconciliation: {
        checkpoint: attempt.reconciliation.checkpoint,
        requestCount: attempt.reconciliation.requestCount,
        lastRequestedAt: attempt.reconciliation.lastRequestedAt,
        lastResponseAt: attempt.reconciliation.lastResponseAt,
        lastResponseCode: attempt.reconciliation.lastResponseCode,
        lastTransactionStatus: attempt.reconciliation.lastTransactionStatus,
      },
      checkout: checkout ? { status: checkout.status, paymentStatus: checkout.paymentStatus, total: checkout.total, currency: checkout.currency } : null,
      orders: (ordersByCheckout.get(String(attempt.checkoutId)) || []).map((order) => ({
        orderId: String(order._id), sellerId: String(order.sellerId), status: order.status,
        paymentStatus: order.paymentStatus, total: order.total, currency: order.currency,
      })),
    };
  }), 200, { page: page.page, limit: page.limit, total, serverNow: new Date().toISOString() });
});

router.get("/admin/payments/:id", requireAuth, requireAdmin, async (req, res) => {
  checkId(req.params.id);
  const attempt = await PaymentAttempt.findById(req.params.id);
  if (!attempt) throw problem(404, "NOT_FOUND", "Không tìm thấy payment attempt.");
  const [checkout, orders, events] = await Promise.all([
    Checkout.findById(attempt.checkoutId).select("status paymentStatus total currency paymentMethod expiresAt"),
    Order.find({ checkoutId: attempt.checkoutId }).select("_id sellerId status paymentStatus total currency shippedAt receivedAt paymentReviewHold paymentReviewReason"),
    PaymentEvent.find({ paymentAttemptId: attempt._id }).sort({ receivedAt: -1, _id: -1 }).limit(100),
  ]);
  await AuditEvent.create([{
    actorId: req.user._id,
    action: "PAYMENT_DETAIL_READ",
    targetType: "PAYMENT_ATTEMPT",
    targetId: attempt._id,
    requestId: req.requestId,
    fromState: attempt.status,
    toState: attempt.status,
  }]);
  return success(req, res, {
    attempt: {
      attemptId: String(attempt._id),
      checkoutId: String(attempt.checkoutId),
      buyerId: String(attempt.buyerId),
      provider: attempt.provider,
      providerReference: attempt.merchantReference,
      providerTransactionNo: attempt.providerTransactionNo || null,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      requestedAt: attempt.requestedAt,
      expiresAt: attempt.expiresAt,
      verifiedAt: attempt.verifiedAt,
      responseCode: attempt.responseCode,
      transactionStatus: attempt.transactionStatus,
      reconciliation: attempt.reconciliation,
    },
    checkout: checkout ? {
      status: checkout.status, paymentStatus: checkout.paymentStatus,
      total: checkout.total, currency: checkout.currency, paymentMethod: checkout.paymentMethod,
      expiresAt: checkout.expiresAt,
    } : null,
    orders: orders.map((order) => ({
      orderId: String(order._id), sellerId: String(order.sellerId), status: order.status,
      paymentStatus: order.paymentStatus, total: order.total, currency: order.currency,
      shippedAt: order.shippedAt, receivedAt: order.receivedAt,
      paymentReviewHold: order.paymentReviewHold, paymentReviewReason: order.paymentReviewReason,
    })),
    events: events.map((event) => ({
      eventId: String(event._id), source: event.source, providerRequestId: event.providerRequestId || null,
      providerResponseId: event.providerResponseId || null, merchantReference: event.merchantReference,
      providerTransactionNo: event.providerTransactionNo, signatureStatus: event.signatureStatus,
      merchantMatched: event.merchantMatched, referenceMatched: event.referenceMatched,
      amountMatched: event.amountMatched, expectedAmount: event.expectedAmount,
      receivedAmount: event.receivedAmount, responseCode: event.responseCode,
      transactionStatus: event.transactionStatus, decision: event.decision,
      reasonCode: event.reasonCode, receivedAt: event.receivedAt,
    })),
  }, 200, { serverNow: new Date().toISOString() });
});

router.post("/checkouts/:id/payment-attempts", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  emptyBody(req);
  const idempotencyKey = readIdempotencyKey(req);
  const result = await createPaymentAttempt({
    checkoutId: req.params.id,
    buyerId: req.user._id,
    idempotencyKey,
    idempotencyFingerprint: fingerprint({ operation: "VNPAY_ATTEMPT", checkoutId: req.params.id }),
    ipAddress: req.ip || req.socket.remoteAddress,
    requestId: req.requestId,
  });
  return success(req, res, {
    attemptId: String(result.attempt._id),
    status: result.attempt.status,
    paymentUrl: result.attempt.paymentUrl,
    expiresAt: result.attempt.expiresAt,
    canRedirect: Boolean(result.attempt.paymentUrl && result.attempt.status === "PENDING" && result.attempt.expiresAt > new Date()),
  }, result.reused ? 200 : 201, {
    idempotentReplay: result.reused,
    serverNow: new Date().toISOString(),
  });
});

router.post("/checkouts/:id/cancel", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  emptyBody(req);
  readIdempotencyKey(req);
  const checkout = await cancelVnpayCheckout({
    checkoutId: req.params.id,
    buyerId: req.user._id,
    requestId: req.requestId,
  });
  const orders = await Order.find({ checkoutId: checkout._id }).sort({ sellerId: 1 });
  return success(req, res, checkoutDTO(checkout, orders), 200, { serverNow: new Date().toISOString() });
});

router.post("/checkouts/:id/confirm", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  throw problem(410, "ENDPOINT_RETIRED", "Checkout được xác nhận khi tạo; không nhận lệnh confirm từ client.");
});

router.get("/me/orders", requireAuth, async (req, res) => {
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

router.get("/me/sales", requireAuth, async (req, res) => {
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

router.get("/orders/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);
  const order = await Order.findOne({
    _id: req.params.id,
    $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
  });
  if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const [data] = await orderDTOs([order], req.user._id);
  return success(req, res, data, 200, { serverNow: new Date().toISOString() });
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
      trackingCode.length < 3 || trackingCode.length > 100 || /[\u0000-\u001f]/.test(trackingCode)) {
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
