const router = require("express").Router();
const AuditEvent = require("../../models/AuditEvent");
const { Order, CodCollection, CodReturnRequest } = require("../../models/commerce");
const { recordCodCollection, requestCodReturn, decideCodReturn } = require("../../services/codOrders");
const { success } = require("../../http/responses");
const { readIdempotencyKey, fingerprint } = require("../../domain/idempotency");
const { requireAuth, requireAdmin } = require("../../middleware/requireAuth");
const { problem, validId } = require("../../domain/commerceRules");
const { buyerOnly, checkId, readPagination } = require("./request");

router.post("/orders/:id/cod-collection", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["amount", "note"].includes(key)) ||
    !Number.isSafeInteger(body.amount) ||
    body.amount < 1 ||
    (body.note !== undefined && typeof body.note !== "string")
  ) {
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Số tiền hoặc ghi chú thu COD không hợp lệ.",
    );
  }
  const note = (body.note || "").trim();
  if (note.length > 1000)
    throw problem(422, "VALIDATION_ERROR", "Ghi chú tối đa 1000 ký tự.");
  const idempotencyKey = readIdempotencyKey(req);
  const idempotencyFingerprint = fingerprint({
    operation: "COD_COLLECTION",
    orderId: req.params.id,
    amount: body.amount,
    note,
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
  return success(
    req,
    res,
    {
      collectionId: String(collection._id),
      orderId: String(collection.orderId),
      amount: collection.amount,
      currency: collection.currency,
      source: collection.source,
      recordedAt: collection.recordedAt,
    },
    result.reused ? 200 : 201,
    {
      idempotentReplay: result.reused,
      serverNow: new Date().toISOString(),
    },
  );
});

router.get(
  "/admin/cod-collections",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (
      Object.keys(req.query).some(
        (key) => !["orderId", "sellerId", "page", "limit"].includes(key),
      ) ||
      (req.query.orderId !== undefined && !validId(req.query.orderId)) ||
      (req.query.sellerId !== undefined && !validId(req.query.sellerId))
    ) {
      throw problem(422, "VALIDATION_ERROR", "Bộ lọc COD không hợp lệ.");
    }
    const page = readPagination(
      req.query,
      ["orderId", "sellerId", "page", "limit"],
      [],
    );
    if (!page)
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Bộ lọc hoặc phân trang không hợp lệ.",
      );
    const filter = {
      ...(req.query.orderId ? { orderId: req.query.orderId } : {}),
      ...(req.query.sellerId ? { sellerId: req.query.sellerId } : {}),
    };
    const [collections, total] = await Promise.all([
      CodCollection.find(filter)
        .sort({ recordedAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit),
      CodCollection.countDocuments(filter),
    ]);
    if (collections.length) {
      await AuditEvent.create(
        collections.map((collection) => ({
          actorId: req.user._id,
          action: "COD_COLLECTION_LOOKUP_READ",
          targetType: "COD_COLLECTION",
          targetId: collection._id,
          requestId: req.requestId,
          fromState: "RECORDED",
          toState: "RECORDED",
        })),
      );
    }
    return success(
      req,
      res,
      collections.map((collection) => ({
        collectionId: String(collection._id),
        orderId: String(collection.orderId),
        buyerId: String(collection.buyerId),
        sellerId: String(collection.sellerId),
        amount: collection.amount,
        currency: collection.currency,
        source: collection.source,
        recordedAt: collection.recordedAt,
        requestId: collection.requestId,
      })),
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

router.post(
  "/orders/:id/cod-return-requests",
  ...buyerOnly,
  async (req, res) => {
    checkId(req.params.id);
    const body = req.body;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "reason") ||
      typeof body.reason !== "string"
    ) {
      throw problem(422, "VALIDATION_ERROR", "Yêu cầu cần có reason hợp lệ.");
    }
    const reason = body.reason.trim();
    if (reason.length < 10 || reason.length > 2000) {
      throw problem(
        422,
        "VALIDATION_ERROR",
        "reason cần từ 10 đến 2000 ký tự.",
      );
    }
    const idempotencyKey = readIdempotencyKey(req);
    const idempotencyFingerprint = fingerprint({
      operation: "COD_RETURN_REQUEST",
      orderId: req.params.id,
      reason,
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
    return success(
      req,
      res,
      {
        requestId: String(record._id),
        orderId: String(record.orderId),
        status: record.status,
        reason: record.reason,
        trackingCode: record.trackingCode,
        createdAt: record.createdAt,
      },
      result.reused ? 200 : 201,
      {
        idempotentReplay: result.reused,
        serverNow: new Date().toISOString(),
      },
    );
  },
);

router.get(
  "/admin/cod-return-requests",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const statuses = ["OPEN", "ACCEPTED", "REJECTED"];
    const page = readPagination(
      req.query,
      ["status", "page", "limit"],
      statuses,
    );
    if (!page)
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Bộ lọc hoặc phân trang không hợp lệ.",
      );
    const filter = page.status ? { status: page.status } : {};
    const [records, total] = await Promise.all([
      CodReturnRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit),
      CodReturnRequest.countDocuments(filter),
    ]);
    const orders = await Order.find({
      _id: { $in: records.map((record) => record.orderId) },
    }).select(
      "buyerId sellerId status paymentStatus currency total trackingCode shippedAt items",
    );
    const orderById = new Map(
      orders.map((order) => [String(order._id), order]),
    );
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
        order: order
          ? {
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
            }
          : null,
      };
    });
    if (records.length) {
      await AuditEvent.create(
        records.map((record) => ({
          actorId: req.user._id,
          action: "COD_RETURN_LOOKUP_READ",
          targetType: "COD_RETURN_REQUEST",
          targetId: record._id,
          requestId: req.requestId,
          fromState: record.status,
          toState: record.status,
        })),
      );
    }
    return success(req, res, data, 200, {
      page: page.page,
      limit: page.limit,
      total,
      serverNow: new Date().toISOString(),
    });
  },
);

router.post(
  "/admin/orders/:id/cod-return-decisions",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    checkId(req.params.id);
    const body = req.body;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["requestId", "decision", "reason"].includes(key),
      ) ||
      !validId(body.requestId) ||
      !["ACCEPT_RETURN", "REJECT_RETURN"].includes(body.decision) ||
      typeof body.reason !== "string"
    ) {
      throw problem(
        422,
        "VALIDATION_ERROR",
        "Quyết định hoàn COD không hợp lệ.",
      );
    }
    const reason = body.reason.trim();
    if (reason.length < 10 || reason.length > 2000) {
      throw problem(
        422,
        "VALIDATION_ERROR",
        "reason cần từ 10 đến 2000 ký tự.",
      );
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
    return success(
      req,
      res,
      {
        requestId: String(record._id),
        orderId: String(record.orderId),
        status: record.status,
        decisionReason: record.decisionReason,
        decidedAt: record.decidedAt,
      },
      200,
      {
        idempotentReplay: result.reused,
        serverNow: new Date().toISOString(),
      },
    );
  },
);

module.exports = router;
