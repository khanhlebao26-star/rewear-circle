const router = require("express").Router();
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { rateLimit } = require("express-rate-limit");
const { randomInt, createHmac, timingSafeEqual } = require("node:crypto");
const User = require("../models/User");
const { requireAuth } = require("../middleware/requireAuth");

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 1025),
  secure: Number(process.env.SMTP_PORT) === 465,
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

function ok(req, res, status, data) {
  return res.status(status).json({ data, meta: { requestId: req.requestId } });
}

function fail(req, res, status, code, message) {
  return res.status(status).json({
    error: { code, message, retryable: false },
    meta: { requestId: req.requestId },
  });
}

function safeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

function hashCode(userId, code) {
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(`${userId}:${code}`)
    .digest("hex");
}

async function sendVerificationCode(user) {
  const now = new Date();

  if (user.emailVerifiedAt) return false;
  if (user.verificationSentAt && now - user.verificationSentAt < 60_000) {
    return false;
  }

  if (
    !user.verificationWindowStart ||
    now - user.verificationWindowStart >= 60 * 60_000
  ) {
    user.verificationWindowStart = now;
    user.verificationSendsInWindow = 0;
  }

  if (user.verificationSendsInWindow >= 5) return false;

  const code = String(randomInt(100000, 1000000));
  user.verificationHash = hashCode(user._id, code);
  user.verificationExpiresAt = new Date(now.getTime() + 10 * 60_000);
  user.verificationAttempts = 0;
  user.verificationSentAt = now;
  user.verificationSendsInWindow += 1;
  await user.save();

  await mailer.sendMail({
    from: process.env.MAIL_FROM,
    to: user.email,
    subject: "Mã xác minh Rewear Circle",
    text: `Mã xác minh của bạn là ${code}. Mã hết hạn sau 10 phút.`,
  });

  return true;
}

const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) =>
    fail(req, res, 429, "RATE_LIMITED", "Bạn đã thử quá nhiều lần."),
});

router.post("/auth/register", authLimit, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "").trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12 ||
      displayName.length < 2 ||
      displayName.length > 100
    ) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Thông tin đăng ký không hợp lệ.",
      );
    }

    if (await User.exists({ email })) {
      return fail(req, res, 409, "EMAIL_EXISTS", "Email đã được sử dụng.");
    }

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName,
    });

    try {
      await sendVerificationCode(user);
    } catch {
      return fail(
        req,
        res,
        503,
        "EMAIL_UNAVAILABLE",
        "Tài khoản đã tạo nhưng chưa gửi được mã. Hãy đăng nhập và gửi lại mã.",
      );
    }

    return ok(req, res, 201, {
      user: safeUser(user),
      message: "Đã tạo tài khoản. Hãy kiểm tra email.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return fail(req, res, 409, "EMAIL_EXISTS", "Email đã được sử dụng.");
    }
    next(error);
  }
});

router.post("/auth/login", authLimit, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail(
        req,
        res,
        401,
        "INVALID_CREDENTIALS",
        "Email hoặc mật khẩu không đúng.",
      );
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });

    req.session.userId = String(user._id);

    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    return ok(req, res, 200, { user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", requireAuth, async (req, res, next) => {
  try {
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie("rewear.sid", { path: "/" });
    return ok(req, res, 200, { message: "Đã đăng xuất." });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  return ok(req, res, 200, safeUser(req.user));
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const keys = Object.keys(req.body || {});
    if (keys.length !== 1 || keys[0] !== "displayName") {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Chỉ được sửa tên hiển thị.",
      );
    }

    const displayName = String(req.body.displayName || "").trim();
    if (displayName.length < 2 || displayName.length > 100) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Tên hiển thị không hợp lệ.",
      );
    }

    req.user.displayName = displayName;
    await req.user.save();
    return ok(req, res, 200, safeUser(req.user));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/auth/resend-verification",
  authLimit,
  requireAuth,
  async (req, res, next) => {
    try {
      await sendVerificationCode(req.user);
      return ok(req, res, 200, {
        message: "Nếu đủ điều kiện, mã mới sẽ được gửi đến email của bạn.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/auth/verify-email",
  authLimit,
  requireAuth,
  async (req, res, next) => {
    try {
      const code = String(req.body?.code || "");
      const user = req.user;

      if (!/^\d{6}$/.test(code)) {
        return fail(req, res, 422, "VALIDATION_ERROR", "Mã phải gồm 6 chữ số.");
      }
      if (user.emailVerifiedAt) {
        return ok(req, res, 200, { user: safeUser(user) });
      }
      if (user.verificationAttempts >= 5) {
        return fail(
          req,
          res,
          429,
          "VERIFICATION_ATTEMPTS_EXCEEDED",
          "Mã đã hết lượt thử.",
        );
      }
      if (
        !user.verificationHash ||
        !user.verificationExpiresAt ||
        user.verificationExpiresAt <= new Date()
      ) {
        return fail(
          req,
          res,
          400,
          "VERIFICATION_CODE_EXPIRED",
          "Mã đã hết hạn.",
        );
      }

      const expected = Buffer.from(user.verificationHash, "hex");
      const actual = Buffer.from(hashCode(user._id, code), "hex");

      if (!timingSafeEqual(expected, actual)) {
        user.verificationAttempts += 1;
        await user.save();
        return fail(
          req,
          res,
          400,
          "VERIFICATION_CODE_INVALID",
          "Mã không đúng.",
        );
      }

      user.emailVerifiedAt = new Date();
      user.verificationHash = null;
      user.verificationExpiresAt = null;
      user.verificationAttempts = 0;
      await user.save();

      return ok(req, res, 200, { user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
