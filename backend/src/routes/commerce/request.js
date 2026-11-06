const { failure } = require("../../http/responses");
const { requireAuth, requireVerifiedEmail } = require("../../middleware/requireAuth");
const { problem, validId } = require("../../domain/commerceRules");

function requireBuyerSellerAccess(req, res, next) {
  if (req.user.role !== "USER") {
    return failure(req, res, 404, "NOT_FOUND", "Không tìm thấy tài nguyên.");
  }
  return next();
}

const buyerOnly = [requireAuth, requireBuyerSellerAccess, requireVerifiedEmail];

function readPagination(query, allowed, statuses) {
  if (Object.keys(query).some((key) => !allowed.includes(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return null;
  }
  if (query.status !== undefined && !statuses.includes(query.status))
    return null;
  return { page, limit, status: query.status };
}

function checkId(value) {
  if (!validId(value)) {
    throw problem(422, "INVALID_ID", "ID không hợp lệ.");
  }
}

module.exports = {
  requireBuyerSellerAccess,
  buyerOnly,
  checkId,
  readPagination,
};
