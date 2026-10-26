const User = require("../models/User");

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Vui lòng đăng nhập.",
        retryable: false,
      },
      meta: { requestId: req.requestId },
    });
  }

  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Phiên đăng nhập không hợp lệ.",
        retryable: false,
      },
      meta: { requestId: req.requestId },
    });
  }

  req.user = user;
  next();
}

function requireVerifiedEmail(req, res, next) {
  if (!req.user.emailVerifiedAt) {
    return res.status(403).json({
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Hãy xác minh email trước.",
        retryable: false,
      },
      meta: { requestId: req.requestId },
    });
  }
  next();
}

module.exports = { requireAuth, requireVerifiedEmail };
