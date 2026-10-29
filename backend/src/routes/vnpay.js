const router = require("express").Router();
const loadVnpayConfig = require("../config/vnpay");
const { PaymentAttempt } = require("../models/commerce");
const {
  normalizeTransactionStatus,
  payloadKey,
  recordStandaloneEvent,
  settleVerifiedResult,
} = require("../services/paymentSettlement");
const { parseRawQuery, verifyQuery } = require("../services/vnpayProtocol");

const ACK = {
  "00": "Confirm Success",
  "01": "Order not found",
  "02": "Order already confirmed",
  "04": "Invalid amount",
  "97": "Invalid checksum or parameters",
  "99": "Unknown error",
};

function sendAck(res, code) {
  return res.status(200).json({ RspCode: code, Message: ACK[code] || ACK["99"] });
}

function canonicalPayload(fields) {
  return JSON.stringify(Object.keys(fields).sort().map((key) => [key, fields[key]]));
}

function safeFields(fields) {
  const amount = /^\d{1,12}$/.test(fields.vnp_Amount || "") ? Number(fields.vnp_Amount) : null;
  return {
    source: "IPN",
    eventKey: payloadKey("IPN", canonicalPayload(fields)),
    requestId: "vnpay-ipn",
    merchantReference: String(fields.vnp_TxnRef || "").slice(0, 100),
    providerTransactionNo: String(fields.vnp_TransactionNo || "").slice(0, 32),
    providerResponseId: "",
    signatureStatus: "INVALID",
    merchantMatched: false,
    referenceMatched: false,
    amountMatched: false,
    receivedAmount: amount == null ? null : amount / 100,
    responseCode: String(fields.vnp_ResponseCode || "").slice(0, 16),
    transactionStatus: String(fields.vnp_TransactionStatus || "").slice(0, 16),
    payloadHash: payloadKey("HASH", canonicalPayload(fields)),
    decision: "REJECTED",
    reasonCode: "INVALID_SIGNATURE",
  };
}

router.get("/integrations/payments/vnpay/return", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  return res.status(200).type("html").send(`<!doctype html>
<html lang="vi">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Đã quay lại từ VNPAY</title>
  <main style="max-width:36rem;margin:12vh auto;padding:1.5rem;font:16px/1.6 system-ui,sans-serif">
    <h1>Đã quay lại từ VNPAY</h1>
    <p>Hệ thống đang xác nhận kết quả thanh toán. Chỉ trạng thái đơn hàng trong ReWear Circle mới là kết quả cuối cùng.</p>
    <p>Bạn có thể đóng trang này và kiểm tra lại đơn hàng sau ít phút.</p>
  </main>
</html>`);
});

router.get("/integrations/payments/vnpay/ipn", async (req, res) => {
  const config = loadVnpayConfig();
  if (!config) return sendAck(res, "99");

  const parsed = parseRawQuery(req.originalUrl);
  if (parsed.error || !parsed.fields) return sendAck(res, "97");
  const fields = parsed.fields;
  const digest = canonicalPayload(fields);
  const eventKey = payloadKey("IPN", digest);
  const required = [
    "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_ResponseCode",
    "vnp_TransactionStatus", "vnp_TransactionNo", "vnp_SecureHash",
  ];
  const validShape = required.every((key) => typeof fields[key] === "string" && fields[key].length > 0) &&
    /^[A-Za-z0-9]{8}$/.test(fields.vnp_TmnCode) &&
    /^[A-Za-z0-9]{1,100}$/.test(fields.vnp_TxnRef) &&
    /^\d{1,12}$/.test(fields.vnp_Amount) &&
    /^\d{2}$/.test(fields.vnp_ResponseCode) &&
    /^\d{2}$/.test(fields.vnp_TransactionStatus) &&
    /^\d{1,15}$/.test(fields.vnp_TransactionNo);
  const signatureValid = verifyQuery(fields, config.hashSecret);

  if (!signatureValid || !validShape) {
    const event = safeFields(fields);
    event.eventKey = eventKey;
    event.requestId = req.requestId;
    event.signatureStatus = signatureValid ? "VALID" : "INVALID";
    event.reasonCode = signatureValid ? "INVALID_PARAMETERS" : "INVALID_SIGNATURE";
    await recordStandaloneEvent(event);
    return sendAck(res, "97");
  }

  const amount = Number(fields.vnp_Amount);
  const attempt = await PaymentAttempt.findOne({ merchantReference: fields.vnp_TxnRef }).select("_id");
  const result = await settleVerifiedResult({
    eventKey,
    requestId: req.requestId,
    merchantReference: fields.vnp_TxnRef,
    tmnCode: fields.vnp_TmnCode,
    expectedTmnCode: config.tmnCode,
    amount,
    responseCode: fields.vnp_ResponseCode,
    transactionStatus: fields.vnp_TransactionStatus,
    providerTransactionNo: fields.vnp_TransactionNo,
    resultType: normalizeTransactionStatus(fields.vnp_ResponseCode, fields.vnp_TransactionStatus),
    event: {
      source: "IPN",
      eventKey,
      requestId: req.requestId,
      merchantReference: fields.vnp_TxnRef,
      providerTransactionNo: fields.vnp_TransactionNo,
      signatureStatus: "VALID",
      merchantMatched: fields.vnp_TmnCode === config.tmnCode,
      referenceMatched: Boolean(attempt),
      amountMatched: false,
      receivedAmount: amount / 100,
      responseCode: fields.vnp_ResponseCode,
      transactionStatus: fields.vnp_TransactionStatus,
      payloadHash: payloadKey("HASH", digest),
    },
  });
  return sendAck(res, result.ackCode || "00");
});

module.exports = router;
