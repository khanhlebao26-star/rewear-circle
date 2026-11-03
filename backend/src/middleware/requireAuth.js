const User = require("../models/User");
const { failure } = require("../http/responses");

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return failure(req, res, 401, "UNAUTHORIZED", "Vui lòng đăng nhập.");
  }

  const user = await User.findById(req.session.userId);
  if (!user) {
    return failure(req, res, 401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.");
  }

  req.user = user;
  next();
}

function requireVerifiedEmail(req, res, next) {
  if (!req.user.emailVerifiedAt) {
    return failure(req, res, 403, "EMAIL_NOT_VERIFIED", "Hãy xác minh email trước.");
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return failure(req, res, 401, "UNAUTHORIZED", "Vui lòng đăng nhập.");
    }

    if (!roles.includes(req.user.role)) {
      return failure(req, res, 403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
    }

    next();
  };
}

const requireAdmin = requireRole("ADMIN");
const requireSupport = requireRole("SUPPORT");

module.exports = {
  requireAuth,
  requireVerifiedEmail,
  requireRole,
  requireAdmin,
  requireSupport,
};
