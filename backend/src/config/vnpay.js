const { isIP } = require("node:net");

const PAYMENT_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const QUERYDR_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function httpsUrl(env, name) {
  const value = required(env, name);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS URL`);
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname.includes(".") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0 ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTPS DNS URL without local hosts, credentials, or query parameters`);
  }

  return url.toString();
}

module.exports = function loadVnpayConfig(env = process.env) {
  const enabled = env.VNPAY_ENABLED ?? "false";
  if (enabled === "false") return null;
  if (enabled !== "true") {
    throw new Error("VNPAY_ENABLED must be true or false");
  }

  const tmnCode = required(env, "VNPAY_TMN_CODE");
  if (!/^[a-z\d]{8}$/i.test(tmnCode)) {
    throw new Error("VNPAY_TMN_CODE must contain exactly 8 alphanumeric characters");
  }

  const queryServerIp = required(env, "VNPAY_QUERY_SERVER_IP");
  if (!isIP(queryServerIp)) {
    throw new Error("VNPAY_QUERY_SERVER_IP must be the public IP used for QueryDr requests");
  }

  const returnUrl = httpsUrl(env, "VNPAY_RETURN_URL");
  if (new URL(returnUrl).origin === new URL(PAYMENT_URL).origin) {
    throw new Error("VNPAY_RETURN_URL must point to the merchant site, not the VNPAY payment host");
  }

  return Object.freeze({
    version: "2.1.0",
    tmnCode,
    hashSecret: required(env, "VNPAY_HASH_SECRET"),
    paymentUrl: PAYMENT_URL,
    queryDrUrl: QUERYDR_URL,
    returnUrl,
    ipnUrl: httpsUrl(env, "VNPAY_IPN_URL"),
    queryServerIp,
  });
};
