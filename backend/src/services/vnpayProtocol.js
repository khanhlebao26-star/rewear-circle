const { createHmac, timingSafeEqual } = require("node:crypto");

const HASH_FIELDS = new Set(["vnp_SecureHash", "vnp_SecureHashType"]);

function encode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

function sortedFields(fields) {
  return Object.keys(fields)
    .filter((key) => !HASH_FIELDS.has(key) && fields[key] !== undefined && fields[key] !== null)
    .sort()
    .map((key) => [key, String(fields[key])]);
}

function hashQuery(fields, secret) {
  const data = sortedFields(fields).map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");
  return createHmac("sha512", secret).update(data, "utf8").digest("hex");
}

function safeEqualHex(actual, expected) {
  if (typeof actual !== "string" || !/^[a-f\d]{128}$/i.test(actual)) return false;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyQuery(fields, secret) {
  return safeEqualHex(fields.vnp_SecureHash, hashQuery(fields, secret));
}

function buildPaymentUrl(baseUrl, fields, secret) {
  const signedFields = { ...fields, vnp_SecureHash: hashQuery(fields, secret) };
  const query = Object.keys(signedFields).sort()
    .map((key) => `${encode(key)}=${encode(signedFields[key])}`)
    .join("&");
  return `${baseUrl}?${query}`;
}

function hashQueryDrResponse(fields, secret) {
  const names = [
    "vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode",
    "vnp_TxnRef", "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo",
    "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo", "vnp_PromotionCode",
    "vnp_PromotionAmount",
  ];
  const data = names.map((name) => fields[name] ?? "").join("|");
  return createHmac("sha512", secret).update(data, "utf8").digest("hex");
}

function verifyQueryDrResponse(fields, secret) {
  return safeEqualHex(fields.vnp_SecureHash, hashQueryDrResponse(fields, secret));
}

function vnpayDate(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function parseRawQuery(rawUrl) {
  const rawQuery = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1).split("#", 1)[0] : "";
  const fields = Object.create(null);
  const pairs = new URLSearchParams(rawQuery);
  for (const [key, value] of pairs) {
    if (!key.startsWith("vnp_")) continue;
    if (Object.hasOwn(fields, key)) return { fields: null, error: "DUPLICATE_PARAMETER" };
    fields[key] = value;
  }
  return { fields, error: "" };
}

module.exports = {
  buildPaymentUrl,
  hashQuery,
  hashQueryDrResponse,
  parseRawQuery,
  safeEqualHex,
  verifyQuery,
  verifyQueryDrResponse,
  vnpayDate,
};
