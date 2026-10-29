const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const {
  buildPaymentUrl,
  hashQuery,
  hashQueryDrResponse,
  parseRawQuery,
  verifyQuery,
  verifyQueryDrResponse,
  vnpayDate,
} = require("../src/services/vnpayProtocol");
const { normalizeTransactionStatus } = require("../src/services/paymentSettlement");
const { queryDrRequest } = require("../src/jobs/vnpayReconciliation");
const loadVnpayConfig = require("../src/config/vnpay");

test("VNPAY config rejects the payment gateway as the merchant return URL", () => {
  assert.throws(() => loadVnpayConfig({
    VNPAY_ENABLED: "true",
    VNPAY_TMN_CODE: "ABCD1234",
    VNPAY_HASH_SECRET: "test-hash-secret",
    VNPAY_RETURN_URL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    VNPAY_IPN_URL: "https://merchant.example.test/api/v1/integrations/payments/vnpay/ipn",
    VNPAY_QUERY_SERVER_IP: "203.0.113.10",
  }), /must point to the merchant site/);
});

test("PAY URL uses sorted URL-encoded HMAC-SHA512 fields and rejects tampering", () => {
  const fields = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_OrderInfo: "Thanh toan don A B",
    vnp_Amount: "12000000",
    vnp_TxnRef: "RC20261029abc123",
  };
  const secret = "test-hash-secret";
  const url = new URL(buildPaymentUrl("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", fields, secret));
  const parsed = Object.fromEntries(url.searchParams.entries());
  assert.equal(verifyQuery(parsed, secret), true);
  assert.equal(parsed.vnp_SecureHash.length, 128);
  parsed.vnp_Amount = "12000001";
  assert.equal(verifyQuery(parsed, secret), false);

  const expectedData = "vnp_Amount=12000000&vnp_Command=pay&vnp_OrderInfo=Thanh+toan+don+A+B&vnp_TxnRef=RC20261029abc123&vnp_Version=2.1.0";
  assert.equal(hashQuery(fields, secret), createHmac("sha512", secret).update(expectedData).digest("hex"));
});

test("IPN query parser rejects duplicate signed parameters", () => {
  assert.deepEqual(parseRawQuery("/ipn?vnp_TxnRef=first&vnp_TxnRef=second"), {
    fields: null,
    error: "DUPLICATE_PARAMETER",
  });
  assert.equal(parseRawQuery("/ipn?vnp_TxnRef=one&ignored=two").fields.vnp_TxnRef, "one");
});

test("QueryDr request and response use their protocol-specific HMAC inputs", () => {
  const attempt = {
    merchantReference: "RC20261029abc123",
    requestedAt: new Date("2026-10-28T17:00:00.000Z"),
  };
  const config = {
    version: "2.1.0",
    tmnCode: "ABCD1234",
    hashSecret: "test-hash-secret",
    queryServerIp: "203.0.113.10",
  };
  const request = queryDrRequest(attempt, config, "QD20261029abcdef0123456789", new Date("2026-10-29T00:01:02.000Z"));
  const requestData = [
    request.vnp_RequestId, request.vnp_Version, request.vnp_Command, request.vnp_TmnCode,
    request.vnp_TxnRef, request.vnp_TransactionDate, request.vnp_CreateDate, request.vnp_IpAddr,
    request.vnp_OrderInfo,
  ].join("|");
  assert.equal(request.vnp_TransactionDate, "20261029000000");
  assert.equal(request.vnp_CreateDate, "20261029070102");
  assert.equal(request.vnp_SecureHash, createHmac("sha512", config.hashSecret).update(requestData).digest("hex"));

  const response = {
    vnp_ResponseId: "RESPONSE123",
    vnp_Command: "querydr",
    vnp_ResponseCode: "00",
    vnp_Message: "Query success",
    vnp_TmnCode: config.tmnCode,
    vnp_TxnRef: attempt.merchantReference,
    vnp_Amount: "12000000",
    vnp_BankCode: "NCB",
    vnp_PayDate: "20261029070102",
    vnp_TransactionNo: "123456789",
    vnp_TransactionType: "01",
    vnp_TransactionStatus: "00",
    vnp_OrderInfo: "Query transaction RC20261029abc123",
    vnp_PromotionCode: "",
    vnp_PromotionAmount: "",
  };
  response.vnp_SecureHash = hashQueryDrResponse(response, config.hashSecret);
  assert.equal(verifyQueryDrResponse(response, config.hashSecret), true);
  response.vnp_Amount = "12000001";
  assert.equal(verifyQueryDrResponse(response, config.hashSecret), false);
});

test("VNPAY dates and result mapping preserve uncertain states", () => {
  assert.equal(vnpayDate(new Date("2026-10-28T17:00:00.000Z")), "20261029000000");
  assert.equal(normalizeTransactionStatus("00", "00"), "SUCCESS");
  assert.equal(normalizeTransactionStatus("00", "01"), "PENDING");
  assert.equal(normalizeTransactionStatus("11", "02"), "EXPIRED");
  assert.equal(normalizeTransactionStatus("24", "02"), "FAILED");
  assert.equal(normalizeTransactionStatus("00", "02", "QUERY"), "FAILED");
  assert.equal(normalizeTransactionStatus("00", "07"), "NEEDS_REVIEW");
  assert.equal(normalizeTransactionStatus("91", "00"), "NEEDS_REVIEW");
});
