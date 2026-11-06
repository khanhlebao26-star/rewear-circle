const router = require("express").Router();
const { Order } = require("../../models/commerce");
const { cancelCodOrder, markOrderShipped, confirmOrderReceipt } = require("../../services/codOrders");
const { success } = require("../../http/responses");
const { readIdempotencyKey } = require("../../domain/idempotency");
const { requireAuth } = require("../../middleware/requireAuth");
const { problem } = require("../../domain/commerceRules");
const {
  requireBuyerSellerAccess,
  readPagination,
  checkId,
  buyerOnly,
} = require("./request");
const { orderDTOs } = require("./orderDetails");

const orderStatuses = [
  "PLACED",
  "PENDING",
  "CONFIRMED",
  "PAID",
  "PAYMENT_FAILED",
  "EXPIRED",
  "CANCELLED",
  "NEEDS_REVIEW",
  "RETURNED",
  "COMPLETED",
];

function emptyBody(req) {
  const body = req.body ?? {};
  if (
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length
  ) {
    throw problem(422, "VALIDATION_ERROR", "Request body phải rỗng.");
  }
}

router.get(
  "/me/orders",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    const perspective = req.query.perspective ?? "buying";
    if (!["buying", "selling"].includes(perspective)) {
      throw problem(
        422,
        "VALIDATION_ERROR",
        "perspective phải là buying hoặc selling.",
      );
    }
    const page = readPagination(
      req.query,
      ["perspective", "status", "page", "limit"],
      orderStatuses,
    );
    if (!page)
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Bộ lọc hoặc phân trang không hợp lệ.",
      );
    const filter = {
      [perspective === "buying" ? "buyerId" : "sellerId"]: req.user._id,
      ...(page.status ? { status: page.status } : {}),
    };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit),
      Order.countDocuments(filter),
    ]);
    return success(req, res, await orderDTOs(orders, req.user._id), 200, {
      perspective,
      page: page.page,
      limit: page.limit,
      total,
      serverNow: new Date().toISOString(),
    });
  },
);

router.get(
  "/me/sales",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    const page = readPagination(
      req.query,
      ["status", "page", "limit"],
      orderStatuses,
    );
    if (!page)
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Bộ lọc hoặc phân trang không hợp lệ.",
      );
    const filter = {
      sellerId: req.user._id,
      ...(page.status ? { status: page.status } : {}),
    };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit),
      Order.countDocuments(filter),
    ]);
    return success(req, res, await orderDTOs(orders, req.user._id), 200, {
      perspective: "selling",
      page: page.page,
      limit: page.limit,
      total,
      serverNow: new Date().toISOString(),
    });
  },
);

router.get(
  "/orders/:id",
  requireAuth,
  requireBuyerSellerAccess,
  async (req, res) => {
    checkId(req.params.id);
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
    });
    if (!order) throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
    const [data] = await orderDTOs([order], req.user._id);
    return success(req, res, data, 200, {
      serverNow: new Date().toISOString(),
    });
  },
);

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
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["carrierName", "trackingCode"].includes(key),
    ) ||
    typeof body.carrierName !== "string" ||
    typeof body.trackingCode !== "string"
  ) {
    throw problem(422, "VALIDATION_ERROR", "Thông tin vận đơn không hợp lệ.");
  }
  const carrierName = body.carrierName.trim();
  const trackingCode = body.trackingCode.trim();
  if (
    carrierName.length < 2 ||
    carrierName.length > 100 ||
    trackingCode.length < 3 ||
    trackingCode.length > 100 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(carrierName) ||
    /[\u0000-\u001f\u007f-\u009f]/.test(trackingCode)
  ) {
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Tên đơn vị vận chuyển hoặc mã vận đơn không hợp lệ.",
    );
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

router.post(
  "/orders/:id/receipt-confirmation",
  ...buyerOnly,
  async (req, res) => {
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
  },
);

module.exports = router;
