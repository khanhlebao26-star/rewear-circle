const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { success, failure } = require("./http/responses");
const requestLogger = require("./http/requestLogger");

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(requestLogger);

app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: "rewear.sid",
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// Chặn request thay đổi dữ liệu đến từ website khác.
app.use("/api/v1", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  if (req.get("Origin") !== process.env.APP_ORIGIN) {
    return failure(req, res, 403, "INVALID_ORIGIN", "Nguồn yêu cầu không hợp lệ.");
  }

  next();
});

app.get("/health/live", (req, res) => {
  return success(req, res, { status: "live" });
});

app.get("/health/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return success(req, res, { status: ready ? "ready" : "not_ready" }, ready ? 200 : 503);
});

app.use("/api/v1", require("./routes/auth"));
app.use("/api/v1", require("./routes/media"));
app.use("/api/v1", require("./routes/listings"));
app.use("/api/v1", require("./routes/moderation"));
app.use("/api/v1", require("./routes/commerce"));

app.use((req, res) => {
  return failure(req, res, 404, "NOT_FOUND", "Không tìm thấy.");
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = Number.isInteger(err.status) ? err.status : 500;
  req.errorCode = typeof err.code === "string" && /^[A-Z0-9_]{1,64}$/.test(err.code)
    ? err.code
    : status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";

  return failure(
    req,
    res,
    status,
    req.errorCode,
    status === 500 ? "Lỗi máy chủ." : err.message,
  );
});

module.exports = app;
