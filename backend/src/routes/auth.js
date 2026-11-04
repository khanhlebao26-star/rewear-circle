const router = require("express").Router();
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { rateLimit } = require("express-rate-limit");
const { randomInt, createHmac, timingSafeEqual } = require("node:crypto");
const User = require("../models/User");
const { validPassword } = require("../domain/passwordRules");
const { requireAuth } = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 1025),
  secure: Number(process.env.SMTP_PORT) === 465,
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

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
  if (user.verificationSentAt && now - user.verificationSentAt < 60_000)
    return false;

  const resetWindow =
    !user.verificationWindowStart ||
    now - user.verificationWindowStart >= 60 * 60_000;
  const sends = resetWindow ? 0 : user.verificationSendsInWindow || 0;
  if (sends >= 5) return false;

  let code;
  do {
    code = String(randomInt(100000, 1000000));
  } while (hashCode(user._id, code) === user.verificationHash);
  // Compare the current token and send time: at most one concurrent resend wins.
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerifiedAt: null,
      verificationHash: user.verificationHash ?? null,
      verificationSentAt: user.verificationSentAt ?? null,
    },
    {
      $set: {
        verificationHash: hashCode(user._id, code),
        verificationExpiresAt: new Date(now.getTime() + 10 * 60_000),
        verificationAttempts: 0,
        verificationSentAt: now,
        verificationWindowStart: resetWindow
          ? now
          : user.verificationWindowStart,
        verificationSendsInWindow: sends + 1,
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated) return false;

  await mailer.sendMail({
    from: process.env.MAIL_FROM,
    to: updated.email,
    subject: "Mã xác minh Rewear Circle",
    text: `Mã xác minh của bạn là ${code}. Mã hết hạn sau 10 phút.`,
  });
  return true;
}

function verificationError(user, now) {
  if (!user) return [401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ."];
  if (user.verificationAttempts >= 5) {
    return [429, "VERIFICATION_ATTEMPTS_EXCEEDED", "Mã đã hết lượt thử."];
  }
  if (
    !/^[a-f0-9]{64}$/i.test(user.verificationHash || "") ||
    !user.verificationExpiresAt ||
    user.verificationExpiresAt <= now
  ) {
    return [400, "VERIFICATION_CODE_EXPIRED", "Mã đã hết hạn."];
  }
  return null;
}

const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) =>
    fail(req, res, 429, "RATE_LIMITED", "Bạn đã thử quá nhiều lần."),
});

router.post("/auth/register", authLimit, async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = req.body?.password;
    const displayName = String(req.body?.displayName || "").trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validPassword(password) ||
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

    return success(
      req,
      res,
      {
        user: safeUser(user),
        message: "Đã tạo tài khoản. Hãy kiểm tra email.",
      },
      201,
    );
  } catch (error) {
    if (error.code === 11000) {
      return fail(req, res, 409, "EMAIL_EXISTS", "Email đã được sử dụng.");
    }
    throw error;
  }
});

router.post("/auth/login", authLimit, async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = req.body?.password;
  if (!validPassword(password)) {
    return fail(
      req,
      res,
      422,
      "VALIDATION_ERROR",
      "Mật khẩu cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.",
    );
  }
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

  return success(req, res, { user: safeUser(user) });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  await new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  res.clearCookie("rewear.sid", { path: "/" });
  return success(req, res, { message: "Đã đăng xuất." });
});

router.get("/me", requireAuth, (req, res) => {
  return success(req, res, safeUser(req.user));
});

router.patch("/me", requireAuth, async (req, res) => {
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
  return success(req, res, safeUser(req.user));
});

router.post(
  "/auth/resend-verification",
  authLimit,
  requireAuth,
  async (req, res) => {
    await sendVerificationCode(req.user);
    return success(req, res, {
      message: "Nếu đủ điều kiện, mã mới sẽ được gửi đến email của bạn.",
    });
  },
);

router.post("/auth/verify-email", authLimit, requireAuth, async (req, res) => {
  const code = String(req.body?.code || "");
  const user = req.user;
  if (!/^\d{6}$/.test(code)) {
    return fail(req, res, 422, "VALIDATION_ERROR", "Mã phải gồm 6 chữ số.");
  }
  if (user.emailVerifiedAt) return success(req, res, { user: safeUser(user) });
  const now = new Date();
  const error = verificationError(user, now);
  if (error) return fail(req, res, ...error);

  const matches = timingSafeEqual(
    Buffer.from(user.verificationHash, "hex"),
    Buffer.from(hashCode(user._id, code), "hex"),
  );
  // The token, expiry and quota are checked together with the write.
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerifiedAt: null,
      verificationHash: user.verificationHash,
      verificationExpiresAt: { $gt: now },
      verificationAttempts: { $lt: 5 },
    },
    matches
      ? {
          $set: {
            emailVerifiedAt: now,
            verificationHash: null,
            verificationExpiresAt: null,
            verificationAttempts: 0,
          },
        }
      : { $inc: { verificationAttempts: 1 } },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (updated) {
    return matches
      ? success(req, res, { user: safeUser(updated) })
      : fail(req, res, 400, "VERIFICATION_CODE_INVALID", "Mã không đúng.");
  }
  const current = await User.findById(user._id);
  if (current?.emailVerifiedAt)
    return success(req, res, { user: safeUser(current) });
  const currentError = verificationError(current, new Date());
  if (currentError) return fail(req, res, ...currentError);
  return fail(
    req,
    res,
    400,
    "VERIFICATION_CODE_INVALID",
    "Mã đã thay đổi; hãy dùng mã mới nhất.",
  );
});

module.exports = router;
