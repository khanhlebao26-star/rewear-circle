const router = require("express").Router();
const { success } = require("../../http/responses");
const { readIdempotencyKey } = require("../../domain/idempotency");
const { readComplaintInput } = require("../../domain/moderationRules");
const {
  createComplaint,
  listBuyerComplaints,
  getBuyerComplaint,
} = require("../../services/complaints");
const { problem, validId } = require("../../domain/commerceRules");
const { buyerOnly, readPagination } = require("./request");

router.post("/orders/:id/complaints", ...buyerOnly, async (req, res) => {
  if (!validId(req.params.id))
    throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const input = readComplaintInput(req.body);
  if (!input)
    throw problem(422, "VALIDATION_ERROR", "Dữ liệu khiếu nại không hợp lệ.");
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
  if (!validId(req.params.id))
    throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  const page = readPagination(
    req.query,
    ["type", "status", "page", "limit"],
    ["OPEN", "IN_REVIEW", "CLOSED"],
  );
  if (
    !page ||
    (req.query.type !== undefined &&
      !["DELIVERY", "ITEM"].includes(req.query.type))
  ) {
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Bộ lọc hoặc phân trang không hợp lệ.",
    );
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

router.get(
  "/orders/:id/complaints/:complaintId",
  ...buyerOnly,
  async (req, res) => {
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
  },
);

module.exports = router;
