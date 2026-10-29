const { createHash } = require("node:crypto");
const { problem } = require("./commerceRules");

function readIdempotencyKey(req) {
  const key = req.get("Idempotency-Key");
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    throw problem(422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key không hợp lệ.");
  }
  return key;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertSameFingerprint(saved, expected) {
  if (saved !== expected) {
    throw problem(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng cho dữ liệu khác.");
  }
}

module.exports = { readIdempotencyKey, fingerprint, assertSameFingerprint };
