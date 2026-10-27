const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { randomUUID } = require("node:crypto");

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

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
    return res.status(403).json({
      error: {
        code: "INVALID_ORIGIN",
        message: "Nguồn yêu cầu không hợp lệ.",
        retryable: false,
      },
      meta: { requestId: req.requestId },
    });
  }

  next();
});

app.get("/health/live", (req, res) => {
  res.json({ data: { status: "live" }, meta: { requestId: req.requestId } });
});

app.get("/health/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    data: { status: ready ? "ready" : "not_ready" },
    meta: { requestId: req.requestId },
  });
});

app.use("/api/v1", require("./routes/auth"));
app.use("/api/v1", require("./routes/media"));
app.use("/api/v1", require("./routes/listings"));
app.use("/api/v1", require("./routes/commerce"));

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Không tìm thấy.", retryable: false },
    meta: { requestId: req.requestId },
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  console.error(req.requestId, err);
  const status = Number.isInteger(err.status) ? err.status : 500;

  res.status(status).json({
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: status === 500 ? "Lỗi máy chủ." : err.message,
      retryable: false,
    },
    meta: { requestId: req.requestId },
  });
});

module.exports = app;
