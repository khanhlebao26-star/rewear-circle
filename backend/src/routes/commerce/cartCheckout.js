const router = require("express").Router();
const Listing = require("../../models/Listing");
const {
  Cart,
  Checkout,
  Order,
  CodCollection,
} = require("../../models/commerce");
const { createCheckout } = require("../../services/checkout");
const { success } = require("../../http/responses");
const { readIdempotencyKey, fingerprint } = require("../../domain/idempotency");
const { requireAuth } = require("../../middleware/requireAuth");
const {
  problem,
  validId,
  approvedVersion,
  snapshot,
  readAddress,
} = require("../../domain/commerceRules");
const {
  requireBuyerSellerAccess,
  buyerOnly,
  checkId,
  readPagination,
} = require("./request");
const { orderDTOs } = require("./orderDetails");

const checkoutStatuses = [
  "OPEN",
  "COMPLETED",
  "PENDING_PAYMENT",
  "PAID",
  "PAYMENT_FAILED",
  "EXPIRED",
  "CANCELLED",
  "CONFIRMED",
  "NEEDS_REVIEW",
];

function readCheckoutInput(body) {
  const allowed = new Set([
    "items",
    "recipientName",
    "paymentMethod",
    "recipientPhone",
    "recipientAddress",
  ]);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.has(key))
  ) {
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Body Checkout chứa trường không được hỗ trợ.",
    );
  }
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 20
  ) {
    throw problem(422, "VALIDATION_ERROR", "Checkout cần từ 1 đến 20 món.");
  }
  const items = body.items
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).some(
          (key) =>
            !["listingId", "expectedPrice", "expectedVersionId"].includes(key),
        ) ||
        !validId(item.listingId) ||
        !validId(item.expectedVersionId) ||
        !Number.isSafeInteger(item.expectedPrice) ||
        item.expectedPrice < 1
      ) {
        throw problem(
          422,
          "VALIDATION_ERROR",
          "Thông tin món hoặc giá xác nhận không hợp lệ.",
        );
      }
      return {
        listingId: item.listingId.toLowerCase(),
        expectedPrice: item.expectedPrice,
        expectedVersionId: item.expectedVersionId.toLowerCase(),
      };
    })
    .sort((a, b) => a.listingId.localeCompare(b.listingId));
  if (new Set(items.map((item) => item.listingId)).size !== items.length) {
    throw problem(422, "DUPLICATE_ITEM", "Danh sách có món trùng.");
  }
  if (body.paymentMethod !== "COD") {
    throw problem(
      422,
      "PAYMENT_METHOD_UNAVAILABLE",
      "Hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).",
    );
  }
  const shippingAddress = readAddress({
    fullName: body.recipientName,
    phone: body.recipientPhone,
    address: body.recipientAddress,
  });
  return { items, shippingAddress, paymentMethod: body.paymentMethod };
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

router.delete(
  "/cart/items/:id",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    checkId(req.params.id);

    await Cart.updateOne(
      { buyerId: req.user._id },
      { $pull: { listingIds: req.params.id } },
    );

    return success(req, res, { removed: true }, 200, {
      serverNow: new Date().toISOString(),
    });
  },
);

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
  return success(
    req,
    res,
    checkoutDTO(result.checkout, result.orders),
    result.reused ? 200 : 201,
    {
      idempotentReplay: result.reused,
      serverNow: new Date().toISOString(),
    },
  );
});

router.get(
  "/me/checkouts",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    const page = readPagination(
      req.query,
      ["status", "page", "limit"],
      checkoutStatuses,
    );
    if (!page)
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Bộ lọc hoặc phân trang không hợp lệ.",
      );
    const filter = {
      buyerId: req.user._id,
      ...(page.status ? { status: page.status } : {}),
    };
    const [checkouts, total] = await Promise.all([
      Checkout.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit),
      Checkout.countDocuments(filter),
    ]);
    const orders = await Order.find({
      checkoutId: { $in: checkouts.map((checkout) => checkout._id) },
    }).sort({ sellerId: 1 });
    const ordersByCheckout = new Map();
    for (const order of orders) {
      const key = String(order.checkoutId);
      if (!ordersByCheckout.has(key)) ordersByCheckout.set(key, []);
      ordersByCheckout.get(key).push(order);
    }
    return success(
      req,
      res,
      checkouts.map((checkout) =>
        checkoutDTO(checkout, ordersByCheckout.get(String(checkout._id)) || []),
      ),
      200,
      {
        page: page.page,
        limit: page.limit,
        total,
        serverNow: new Date().toISOString(),
      },
    );
  },
);

router.get(
  "/checkouts/:id",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    checkId(req.params.id);
    const checkout = await Checkout.findOne({
      _id: req.params.id,
      buyerId: req.user._id,
    });

    if (!checkout) {
      throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
    }
    const orders = await Order.find({ checkoutId: checkout._id }).sort({
      sellerId: 1,
    });
    const orderData = await orderDTOs(orders, req.user._id);
    const now = new Date();
    return success(
      req,
      res,
      {
        ...checkoutDTO(checkout, orders),
        orders: orderData,
      },
      200,
      { serverNow: now.toISOString() },
    );
  },
);

router.get(
  "/checkouts/:id/payment",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    checkId(req.params.id);
    const checkout = await Checkout.findOne({
      _id: req.params.id,
      buyerId: req.user._id,
    });
    if (!checkout) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
    const orders = await Order.find({ checkoutId: checkout._id }).sort({
      sellerId: 1,
    });
    const collections = await CodCollection.find({
      orderId: { $in: orders.map((order) => order._id) },
    });
    const byOrder = new Map(
      collections.map((collection) => [String(collection.orderId), collection]),
    );
    return success(
      req,
      res,
      {
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
            collection: collection
              ? {
                  source: collection.source,
                  amount: collection.amount,
                  recordedAt: collection.recordedAt,
                }
              : null,
          };
        }),
      },
      200,
      { serverNow: new Date().toISOString() },
    );
  },
);

router.post("/checkouts/:id/confirm", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  throw problem(
    410,
    "ENDPOINT_RETIRED",
    "Checkout được xác nhận khi tạo; không nhận lệnh confirm từ client.",
  );
});

module.exports = router;
