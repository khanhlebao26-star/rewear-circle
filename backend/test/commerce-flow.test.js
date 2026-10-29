const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const mongoUri = process.env.MONGODB_TEST_URI;

test("checkout, VNPAY attempt/IPN, review holds, admin reads, and COD isolation", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database ending in _test",
}, async () => {
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  process.env.MONGODB_URI = mongoUri;
  process.env.SESSION_SECRET = "integration-test-session-secret";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.VNPAY_ENABLED = "true";
  process.env.VNPAY_TMN_CODE = "ABCD1234";
  process.env.VNPAY_HASH_SECRET = "integration-test-vnpay-secret";
  process.env.VNPAY_RETURN_URL = "https://frontend.example.test/payment/result";
  process.env.VNPAY_IPN_URL = "https://api.example.test/api/v1/integrations/payments/vnpay/ipn";
  process.env.VNPAY_QUERY_SERVER_IP = "203.0.113.10";

  const mongoose = require("mongoose");
  const express = require("express");
  const User = require("../src/models/User");
  const Listing = require("../src/models/Listing");
  const AuditEvent = require("../src/models/AuditEvent");
  const {
    Cart, Checkout, Order, PaymentAttempt, PaymentEvent, CodCollection, CodReturnRequest,
  } = require("../src/models/commerce");
  const { hashQuery, hashQueryDrResponse, parseRawQuery, verifyQuery } = require("../src/services/vnpayProtocol");
  const { expireUnattemptedCheckouts, claimDueAttempt, processClaimedAttempt } = require("../src/jobs/vnpayReconciliation");
  const loadVnpayConfig = require("../src/config/vnpay");

  const models = [User, Listing, AuditEvent, Cart, Checkout, Order, PaymentAttempt, PaymentEvent, CodCollection, CodReturnRequest];
  let server;
  await mongoose.connect(mongoUri);

  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));

    const [sellerA, sellerB, buyer, secondBuyer, admin] = await User.create([
      { email: "seller-a@commerce.test", passwordHash: "hash", displayName: "Seller A", emailVerifiedAt: new Date() },
      { email: "seller-b@commerce.test", passwordHash: "hash", displayName: "Seller B", emailVerifiedAt: new Date() },
      { email: "buyer@commerce.test", passwordHash: "hash", displayName: "Buyer", emailVerifiedAt: new Date() },
      { email: "buyer-two@commerce.test", passwordHash: "hash", displayName: "Buyer Two", emailVerifiedAt: new Date() },
      { email: "admin@commerce.test", passwordHash: "hash", displayName: "Admin", role: "ADMIN", emailVerifiedAt: new Date() },
    ]);
    const unverifiedBuyer = await User.create({
      email: "unverified@commerce.test", passwordHash: "hash", displayName: "Unverified Buyer",
    });

    async function createListing(seller, title, price) {
      const listing = new Listing({
        ownerId: seller._id,
        versions: [{
          title,
          category: "Áo",
          size: "M",
          condition: "Còn tốt",
          description: "Món đồ đã qua sử dụng, còn sạch và dùng tốt.",
          flaws: "",
          price,
          shipFrom: "Hồ Chí Minh",
          imageIds: [],
          status: "APPROVED",
        }],
        reviewHold: false,
      });
      listing.approvedVersionId = listing.versions[0]._id;
      await listing.save();
      return listing;
    }

    const listingA = await createListing(sellerA, "Áo sơ mi A", 120000);
    const listingB = await createListing(sellerB, "Áo khoác B", 85000);
    await Cart.create({ buyerId: buyer._id, listingIds: [listingA._id, listingB._id] });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = randomUUID();
      req.session = { userId: req.get("x-test-user-id") };
      next();
    });
    app.use("/api/v1", require("../src/routes/commerce"));
    app.use("/api/v1", require("../src/routes/vnpay"));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      res.status(error.status || 500).json({ error: { code: error.code || "INTERNAL_ERROR" } });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    async function request(path, { user, method = "GET", body, idempotencyKey } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(user ? { "x-test-user-id": String(user._id) } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { response, data: await response.json() };
    }

    function checkoutBody(listings, paymentMethod = "VNPAY") {
      return {
        items: listings.map((listing) => ({
          listingId: String(listing._id),
          expectedVersionId: String(listing.approvedVersionId),
          expectedPrice: listing.versions.id(listing.approvedVersionId).price,
        })),
        recipientName: "Nguyen Van B",
        recipientPhone: "+84901234567",
        recipientAddress: "123 Nguyen Hue, District 1",
        paymentMethod,
      };
    }

    async function createCheckout(listings, paymentMethod, key, user = buyer) {
      return request("/checkouts", { user, method: "POST", body: checkoutBody(listings, paymentMethod), idempotencyKey: key });
    }

    async function createAttempt(checkoutId, key, user = buyer) {
      return request(`/checkouts/${checkoutId}/payment-attempts`, { user, method: "POST", body: {}, idempotencyKey: key });
    }

    async function sendIpn(fields, { invalidSignature = false } = {}) {
      const signed = { ...fields };
      signed.vnp_SecureHash = hashQuery(signed, process.env.VNPAY_HASH_SECRET);
      if (invalidSignature) signed.vnp_SecureHash = "0".repeat(128);
      const query = new URLSearchParams(signed).toString();
      return request(`/integrations/payments/vnpay/ipn?${query}`);
    }

    async function sendRawIpn(query) {
      return request(`/integrations/payments/vnpay/ipn?${query}`);
    }

    const checkoutResult = await createCheckout([listingA, listingB], "VNPAY", "checkout-key-0001");
    assert.equal(checkoutResult.response.status, 201, JSON.stringify(checkoutResult.data));
    assert.equal(checkoutResult.data.data.status, "PENDING_PAYMENT");
    assert.equal(checkoutResult.data.data.orderIds.length, 2);
    const checkoutId = checkoutResult.data.data.checkoutId;
    assert.equal((await createAttempt(checkoutId, "attempt-key-guest", null)).response.status, 401);
    assert.equal((await createAttempt(checkoutId, "attempt-key-unverified", unverifiedBuyer)).response.status, 403);
    assert.equal((await createAttempt(checkoutId, "attempt-key-other-buyer", secondBuyer)).response.status, 404);
    const firstOrders = await Order.find({ checkoutId }).sort({ sellerId: 1 });
    assert.equal(firstOrders.length, 2);
    assert.equal(firstOrders.reduce((sum, order) => sum + order.total, 0), (await Checkout.findById(checkoutId)).total);
    assert.deepEqual(firstOrders.map((order) => order.items[0].title).sort(), ["Áo khoác B", "Áo sơ mi A"].sort());
    const firstOrder = firstOrders[0];
    const snapshotTitle = firstOrder.items[0].title;
    const addressSnapshot = firstOrder.shippingAddress.address;
    await Order.updateOne({ _id: firstOrder._id }, { $set: { "items.0.title": "Thử sửa snapshot" } });
    await Order.updateOne({ _id: firstOrder._id }, { $set: { "shippingAddress.address": "Địa chỉ giả" } });
    await Checkout.updateOne({ _id: checkoutId }, { $set: { "shippingAddress.address": "Địa chỉ giả" } });
    assert.equal((await Order.findById(firstOrder._id)).items[0].title, snapshotTitle);
    assert.equal((await Order.findById(firstOrder._id)).shippingAddress.address, addressSnapshot);
    assert.equal((await Checkout.findById(checkoutId)).shippingAddress.address, addressSnapshot);
    const replayCheckout = await createCheckout([listingA, listingB], "VNPAY", "checkout-key-0001");
    assert.equal(replayCheckout.response.status, 200);
    assert.equal(replayCheckout.data.data.checkoutId, checkoutId);
    assert.equal((await createCheckout([listingB], "VNPAY", "checkout-key-0001")).response.status, 409);
    assert.equal(await Checkout.countDocuments({ _id: checkoutId }), 1);

    const [attemptResult, concurrentAttempt] = await Promise.all([
      createAttempt(checkoutId, "attempt-key-0001"),
      createAttempt(checkoutId, "attempt-key-0001"),
    ]);
    assert.equal(attemptResult.response.status, 201);
    assert.equal(concurrentAttempt.response.status, 200);
    assert.equal(attemptResult.data.data.status, "PENDING");
    assert.equal(attemptResult.data.data.canRedirect, true);
    assert.equal(concurrentAttempt.data.data.attemptId, attemptResult.data.data.attemptId);
    const paymentUrl = new URL(attemptResult.data.data.paymentUrl);
    const paymentFields = Object.fromEntries(paymentUrl.searchParams.entries());
    assert.equal(verifyQuery(paymentFields, process.env.VNPAY_HASH_SECRET), true);
    assert.equal(paymentFields.vnp_Amount, "20500000");
    const replayAttempt = await createAttempt(checkoutId, "attempt-key-0001");
    assert.equal(replayAttempt.response.status, 200);
    assert.equal(replayAttempt.data.data.paymentUrl, attemptResult.data.data.paymentUrl);
    assert.equal((await createAttempt(checkoutId, "attempt-key-0002")).response.status, 409);
    const returnedPayment = await request(`/checkouts/${checkoutId}/payment?vnp_ResponseCode=00`, { user: buyer });
    assert.equal(returnedPayment.data.data.status, "PENDING");
    assert.equal((await Checkout.findById(checkoutId)).status, "PENDING_PAYMENT");

    const ipnFields = {
      vnp_TmnCode: process.env.VNPAY_TMN_CODE,
      vnp_TxnRef: paymentFields.vnp_TxnRef,
      vnp_Amount: paymentFields.vnp_Amount,
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
      vnp_TransactionNo: "123456789",
      vnp_BankCode: "NCB",
      vnp_OrderInfo: paymentFields.vnp_OrderInfo,
      vnp_PayDate: "20261029120000",
    };
    const invalidIpn = await sendIpn(ipnFields, { invalidSignature: true });
    assert.equal(invalidIpn.data.RspCode, "97");
    assert.equal((await Checkout.findById(checkoutId)).status, "PENDING_PAYMENT");
    const missingField = { ...ipnFields };
    delete missingField.vnp_TransactionNo;
    assert.equal((await sendIpn(missingField)).data.RspCode, "97");
    const duplicateFields = new URLSearchParams({
      ...ipnFields,
      vnp_SecureHash: hashQuery(ipnFields, process.env.VNPAY_HASH_SECRET),
    });
    duplicateFields.append("vnp_Amount", ipnFields.vnp_Amount);
    assert.equal((await sendRawIpn(duplicateFields.toString())).data.RspCode, "97");
    assert.equal((await sendIpn({
      ...ipnFields, vnp_TmnCode: "WXYZ1234", vnp_TransactionNo: "823456789",
    })).data.RspCode, "01");
    assert.equal((await sendIpn({
      ...ipnFields, vnp_TxnRef: "RC20261029unknown1234", vnp_TransactionNo: "723456789",
    })).data.RspCode, "01");

    const failedListing = await createListing(sellerA, "Áo thanh toán thất bại", 25000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: failedListing._id } });
    const failedCheckout = await createCheckout([failedListing], "VNPAY", "checkout-key-failed");
    const failedAttempt = await createAttempt(failedCheckout.data.data.checkoutId, "attempt-key-failed");
    assert.equal((await createAttempt(failedCheckout.data.data.checkoutId, "attempt-key-0001")).response.status, 409);
    const failedFields = Object.fromEntries(new URL(failedAttempt.data.data.paymentUrl).searchParams.entries());
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: failedFields.vnp_TxnRef,
      vnp_Amount: failedFields.vnp_Amount,
      vnp_ResponseCode: "24",
      vnp_TransactionStatus: "02",
      vnp_TransactionNo: "623456789",
    })).data.RspCode, "00");
    assert.equal((await PaymentAttempt.findById(failedAttempt.data.data.attemptId)).status, "FAILED");
    assert.equal((await Checkout.findById(failedCheckout.data.data.checkoutId)).status, "PAYMENT_FAILED");
    assert.equal((await Listing.findById(failedListing._id)).saleStatus, "AVAILABLE");

    const rollbackListing = await createListing(sellerA, "Áo phải rollback", 26000);
    const invalidListing = await createListing(sellerB, "Áo không còn bán", 27000);
    await Cart.updateOne({ buyerId: buyer._id }, {
      $addToSet: { listingIds: { $each: [rollbackListing._id, invalidListing._id] } },
    });
    await Listing.updateOne({ _id: invalidListing._id }, { $set: { saleStatus: "SOLD" } });
    const invalidCheckout = await createCheckout([rollbackListing, invalidListing], "VNPAY", "checkout-key-rollback");
    assert.equal(invalidCheckout.response.status, 409);
    assert.equal((await Listing.findById(rollbackListing._id)).saleStatus, "AVAILABLE");
    assert.equal(await Checkout.countDocuments({ "items.listingId": rollbackListing._id }), 0);

    const [successIpn, repeatedIpn] = await Promise.all([sendIpn(ipnFields), sendIpn(ipnFields)]);
    assert.deepEqual([successIpn.data.RspCode, repeatedIpn.data.RspCode].sort(), ["00", "02"]);
    assert.equal((await Checkout.findById(checkoutId)).status, "PAID");
    assert.deepEqual(await Order.find({ checkoutId }).distinct("status"), ["PAID"]);
    const paidListings = await Listing.find({ _id: { $in: [listingA._id, listingB._id] } });
    assert.ok(paidListings.every((listing) => listing.saleStatus === "SOLD" && String(listing.soldCheckoutId) === checkoutId));

    const unauthorizedLookup = await request("/admin/payments", { user: buyer });
    assert.equal(unauthorizedLookup.response.status, 403);
    const adminLookup = await request(`/admin/payments?providerReference=${paymentFields.vnp_TxnRef}`, { user: admin });
    assert.equal(adminLookup.response.status, 200);
    assert.equal(adminLookup.data.data.length, 1);
    assert.equal("paymentUrl" in adminLookup.data.data[0], false);
    const adminDetail = await request(`/admin/payments/${attemptResult.data.data.attemptId}`, { user: admin });
    assert.equal(adminDetail.response.status, 200);
    assert.ok(adminDetail.data.data.events.some((event) => event.source === "IPN" && event.signatureStatus === "INVALID"));
    assert.equal("shippingAddress" in adminDetail.data.data, false);
    assert.equal("paymentUrl" in adminDetail.data.data.attempt, false);

    const staleFailure = await sendIpn({
      ...ipnFields,
      vnp_ResponseCode: "24",
      vnp_TransactionStatus: "02",
      vnp_TransactionNo: "923456789",
    });
    assert.equal(staleFailure.data.RspCode, "00");
    assert.equal((await PaymentAttempt.findById(attemptResult.data.data.attemptId)).status, "SUCCESS");
    assert.equal((await Checkout.findById(checkoutId)).status, "NEEDS_REVIEW");
    assert.equal((await Listing.findById(listingA._id)).paymentReviewHold, true);

    const paidAListing = await createListing(sellerA, "Áo callback hai bên", 61000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: paidAListing._id } });
    await Cart.create({ buyerId: secondBuyer._id, listingIds: [paidAListing._id] });
    const paidACheckout = await createCheckout([paidAListing], "VNPAY", "checkout-key-paid-a");
    const paidAAttempt = await createAttempt(paidACheckout.data.data.checkoutId, "attempt-key-paid-a");
    const paidAFields = Object.fromEntries(new URL(paidAAttempt.data.data.paymentUrl).searchParams.entries());
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: paidAFields.vnp_TxnRef,
      vnp_Amount: paidAFields.vnp_Amount,
      vnp_ResponseCode: "24",
      vnp_TransactionStatus: "02",
      vnp_TransactionNo: "523456789",
    })).data.RspCode, "00");
    const paidBCheckout = await createCheckout([paidAListing], "VNPAY", "checkout-key-paid-b", secondBuyer);
    assert.equal(paidBCheckout.response.status, 201, JSON.stringify(paidBCheckout.data));
    const paidBAttempt = await createAttempt(paidBCheckout.data.data.checkoutId, "attempt-key-paid-b", secondBuyer);
    const paidBFields = Object.fromEntries(new URL(paidBAttempt.data.data.paymentUrl).searchParams.entries());
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: paidBFields.vnp_TxnRef,
      vnp_Amount: paidBFields.vnp_Amount,
      vnp_TransactionNo: "423456788",
    })).data.RspCode, "00");
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: paidAFields.vnp_TxnRef,
      vnp_Amount: paidAFields.vnp_Amount,
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
      vnp_TransactionNo: "523456788",
    })).data.RspCode, "00");
    const twoPaidListing = await Listing.findById(paidAListing._id);
    assert.equal((await PaymentAttempt.findById(paidAAttempt.data.data.attemptId)).status, "SUCCESS");
    assert.equal((await PaymentAttempt.findById(paidBAttempt.data.data.attemptId)).status, "SUCCESS");
    assert.equal(String(twoPaidListing.soldCheckoutId), paidBCheckout.data.data.checkoutId);
    assert.equal(twoPaidListing.paymentReviewHold, true);
    assert.deepEqual(
      await Checkout.find({ _id: { $in: [paidACheckout.data.data.checkoutId, paidBCheckout.data.data.checkoutId] } }).distinct("status"),
      ["NEEDS_REVIEW"],
    );

    const rollbackSettlementListing = await createListing(sellerA, "Áo retry sau transaction", 62000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: rollbackSettlementListing._id } });
    const rollbackSettlementCheckout = await createCheckout([rollbackSettlementListing], "VNPAY", "checkout-key-db-retry");
    const rollbackSettlementAttempt = await createAttempt(rollbackSettlementCheckout.data.data.checkoutId, "attempt-key-db-retry");
    const rollbackSettlementFields = Object.fromEntries(new URL(rollbackSettlementAttempt.data.data.paymentUrl).searchParams.entries());
    const originalAuditCreate = AuditEvent.create;
    try {
      AuditEvent.create = async function (documents, options) {
        const rows = Array.isArray(documents) ? documents : [documents];
        if (rows.some((row) => row.action === "PAYMENT_RESULT_APPLIED")) throw new Error("Injected audit write failure");
        return originalAuditCreate.call(this, documents, options);
      };
      const failedSettlementWrite = await sendIpn({
        ...ipnFields,
        vnp_TxnRef: rollbackSettlementFields.vnp_TxnRef,
        vnp_Amount: rollbackSettlementFields.vnp_Amount,
        vnp_TransactionNo: "323456788",
      });
      assert.equal(failedSettlementWrite.response.status, 500);
    } finally {
      AuditEvent.create = originalAuditCreate;
    }
    assert.equal((await PaymentAttempt.findById(rollbackSettlementAttempt.data.data.attemptId)).status, "PENDING");
    assert.equal((await Listing.findById(rollbackSettlementListing._id)).saleStatus, "RESERVED");
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: rollbackSettlementFields.vnp_TxnRef,
      vnp_Amount: rollbackSettlementFields.vnp_Amount,
      vnp_TransactionNo: "323456788",
    })).data.RspCode, "00");
    assert.equal((await PaymentAttempt.findById(rollbackSettlementAttempt.data.data.attemptId)).status, "SUCCESS");

    const mismatchListing = await createListing(sellerA, "Áo cần đối chiếu", 60000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: mismatchListing._id } });
    const mismatchCheckout = await createCheckout([mismatchListing], "VNPAY", "checkout-key-0002");
    assert.equal(mismatchCheckout.response.status, 201);
    const mismatchAttempt = await createAttempt(mismatchCheckout.data.data.checkoutId, "attempt-key-0003");
    const mismatchFields = Object.fromEntries(new URL(mismatchAttempt.data.data.paymentUrl).searchParams.entries());
    const amountMismatch = await sendIpn({ ...ipnFields, vnp_TxnRef: mismatchFields.vnp_TxnRef, vnp_Amount: String(Number(mismatchFields.vnp_Amount) + 100), vnp_TransactionNo: "223456789" });
    assert.equal(amountMismatch.data.RspCode, "04");
    const heldCheckout = await Checkout.findById(mismatchCheckout.data.data.checkoutId);
    const heldListing = await Listing.findById(mismatchListing._id);
    assert.equal(heldCheckout.status, "NEEDS_REVIEW");
    assert.equal(heldListing.saleStatus, "RESERVED");
    assert.equal(heldListing.paymentReviewHold, true);
    assert.equal((await PaymentAttempt.findById(mismatchAttempt.data.data.attemptId)).status, "NEEDS_REVIEW");

    const conflictListing = await createListing(sellerA, "Áo xung đột quyền nhận", 70000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: conflictListing._id } });
    const conflictCheckout = await createCheckout([conflictListing], "VNPAY", "checkout-key-0003");
    const conflictAttempt = await createAttempt(conflictCheckout.data.data.checkoutId, "attempt-key-0004");
    const conflictFields = Object.fromEntries(new URL(conflictAttempt.data.data.paymentUrl).searchParams.entries());
    const otherCheckoutId = new mongoose.Types.ObjectId();
    const snapshot = conflictListing.versions.id(conflictListing.approvedVersionId);
    const itemSnapshot = {
      listingId: conflictListing._id,
      versionId: snapshot._id,
      sellerId: sellerA._id,
      title: snapshot.title,
      category: snapshot.category,
      size: snapshot.size,
      condition: snapshot.condition,
      description: snapshot.description,
      flaws: snapshot.flaws,
      price: snapshot.price,
      shipFrom: snapshot.shipFrom,
      imageIds: snapshot.imageIds,
    };
    await Checkout.create({
      _id: otherCheckoutId,
      buyerId: sellerB._id,
      requestKey: "competing-cod-key",
      idempotencyFingerprint: "competing-cod-fingerprint",
      contractVersion: 2,
      items: [itemSnapshot],
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      subtotal: snapshot.price,
      shippingFee: 0,
      total: snapshot.price,
      collectibleAmount: snapshot.price,
      collectedAmount: 0,
      outstandingAmount: snapshot.price,
      shippingAddress: { fullName: "Buyer B", phone: "+84901234567", address: "123 Nguyen Hue, District 1" },
      status: "CONFIRMED",
    });
    await Order.create({
      checkoutId: otherCheckoutId,
      buyerId: sellerB._id,
      sellerId: sellerA._id,
      items: [itemSnapshot],
      shippingAddress: { fullName: "Buyer B", phone: "+84901234567", address: "123 Nguyen Hue, District 1" },
      subtotal: snapshot.price,
      shippingFee: 0,
      total: snapshot.price,
      contractVersion: 2,
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      status: "CONFIRMED",
    });
    await Listing.updateOne({ _id: conflictListing._id }, {
      $set: { saleStatus: "SOLD", reservedCheckoutId: null, reservedUntil: null, soldCheckoutId: otherCheckoutId },
    });
    const lateSuccess = await sendIpn({
      ...ipnFields,
      vnp_TxnRef: conflictFields.vnp_TxnRef,
      vnp_Amount: conflictFields.vnp_Amount,
      vnp_TransactionNo: "323456789",
    });
    assert.equal(lateSuccess.data.RspCode, "00");
    assert.equal((await PaymentAttempt.findById(conflictAttempt.data.data.attemptId)).status, "SUCCESS");
    const conflictingListing = await Listing.findById(conflictListing._id);
    assert.equal(String(conflictingListing.soldCheckoutId), String(otherCheckoutId));
    assert.equal(conflictingListing.paymentReviewHold, true);
    assert.ok(conflictingListing.paymentReviewCheckoutIds.some((id) => String(id) === conflictCheckout.data.data.checkoutId));
    assert.equal((await Checkout.findById(otherCheckoutId)).status, "NEEDS_REVIEW");
    assert.equal((await Order.findOne({ checkoutId: otherCheckoutId })).status, "NEEDS_REVIEW");

    const reviewListing = await createListing(sellerA, "Áo ẩn sau khi giữ", 71000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: reviewListing._id } });
    const reviewCheckout = await createCheckout([reviewListing], "VNPAY", "checkout-key-hidden-after-reservation");
    const reviewAttempt = await createAttempt(reviewCheckout.data.data.checkoutId, "attempt-key-hidden-after-reservation");
    await Listing.updateOne({ _id: reviewListing._id }, { $set: { sellerHidden: true, adminHidden: true } });
    const reviewFields = Object.fromEntries(new URL(reviewAttempt.data.data.paymentUrl).searchParams.entries());
    assert.equal((await sendIpn({
      ...ipnFields,
      vnp_TxnRef: reviewFields.vnp_TxnRef,
      vnp_Amount: reviewFields.vnp_Amount,
      vnp_TransactionNo: "323456780",
    })).data.RspCode, "00");
    const settledHiddenListing = await Listing.findById(reviewListing._id);
    assert.equal(settledHiddenListing.saleStatus, "SOLD");
    assert.equal(settledHiddenListing.sellerHidden, true);
    assert.equal(settledHiddenListing.adminHidden, true);

    const codListing = await createListing(sellerB, "Áo COD", 40000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: codListing._id } });
    const codResult = await createCheckout([codListing], "COD", "checkout-key-0004");
    assert.equal(codResult.response.status, 201);
    assert.equal(codResult.data.data.status, "CONFIRMED");
    assert.equal((await Listing.findById(codListing._id)).saleStatus, "SOLD");
    assert.equal((await createAttempt(codResult.data.data.checkoutId, "attempt-key-0005")).response.status, 409);

    const codA = await createListing(sellerA, "COD Seller A", 45000);
    const codB = await createListing(sellerB, "COD Seller B", 85000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: { $each: [codA._id, codB._id] } } });
    const multiCod = await createCheckout([codA, codB], "COD", "checkout-key-0010");
    assert.equal(multiCod.response.status, 201);
    const multiCodId = multiCod.data.data.checkoutId;
    const multiCodOrders = await Order.find({ checkoutId: multiCodId });
    assert.equal(multiCodOrders.length, 2);
    const orderA = multiCodOrders.find((order) => String(order.sellerId) === String(sellerA._id));
    const orderB = multiCodOrders.find((order) => String(order.sellerId) === String(sellerB._id));
    assert.equal((await request(`/orders/${orderB._id}`, { user: secondBuyer })).response.status, 404);
    assert.equal((await request(`/orders/${orderB._id}`, { user: sellerA })).response.status, 404);
    await Listing.updateOne({ _id: codA._id }, { $set: { paymentReviewHold: true } });
    const blockedCodCancel = await request(`/orders/${orderA._id}/cancel`, {
      user: buyer, method: "POST", body: {}, idempotencyKey: "cod-cancel-0001",
    });
    assert.equal(blockedCodCancel.response.status, 409);
    assert.equal((await Listing.findById(codA._id)).saleStatus, "SOLD");
    await Listing.updateOne({ _id: codA._id }, { $set: { paymentReviewHold: false } });
    const cancelledCodOrder = await request(`/orders/${orderA._id}/cancel`, {
      user: buyer, method: "POST", body: {}, idempotencyKey: "cod-cancel-0001",
    });
    assert.equal(cancelledCodOrder.response.status, 200);
    assert.equal((await Listing.findById(codA._id)).saleStatus, "AVAILABLE");
    assert.equal((await Listing.findById(codB._id)).saleStatus, "SOLD");
    const multiCodAfterCancel = await Checkout.findById(multiCodId);
    assert.equal(multiCodAfterCancel.total, 130000);
    assert.equal(multiCodAfterCancel.collectibleAmount, 85000);

    const shippedCod = await request(`/orders/${orderB._id}/shipment`, {
      user: sellerB,
      method: "PUT",
      body: { carrierName: "GHTK", trackingCode: "GHTK-12345" },
    });
    assert.equal(shippedCod.response.status, 200);
    assert.equal(shippedCod.data.data.canFulfill, true);
    assert.equal(shippedCod.data.data.paymentStatus, "UNPAID");
    const wrongSellerCollection = await request(`/orders/${orderB._id}/cod-collection`, {
      user: sellerA,
      method: "POST",
      body: { amount: 85000 },
      idempotencyKey: "cod-collect-wrong-1",
    });
    assert.equal(wrongSellerCollection.response.status, 404);
    const wrongAmountCollection = await request(`/orders/${orderB._id}/cod-collection`, {
      user: sellerB,
      method: "POST",
      body: { amount: 84000 },
      idempotencyKey: "cod-collect-wrong-2",
    });
    assert.equal(wrongAmountCollection.response.status, 422);
    const receivedBeforeCollection = await request(`/orders/${orderB._id}/receipt-confirmation`, {
      user: buyer,
      method: "POST",
      body: {},
      idempotencyKey: "receipt-key-0001",
    });
    assert.equal(receivedBeforeCollection.response.status, 200);
    assert.equal(receivedBeforeCollection.data.data.status, "COMPLETED");
    assert.equal(receivedBeforeCollection.data.data.paymentStatus, "UNPAID");
    const collectionRequests = await Promise.all([
      request(`/orders/${orderB._id}/cod-collection`, {
        user: sellerB, method: "POST", body: { amount: 85000 }, idempotencyKey: "cod-collect-0001",
      }),
      request(`/orders/${orderB._id}/cod-collection`, {
        user: sellerB, method: "POST", body: { amount: 85000 }, idempotencyKey: "cod-collect-0001",
      }),
    ]);
    assert.deepEqual(collectionRequests.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal(await CodCollection.countDocuments({ orderId: orderB._id }), 1);
    assert.equal((await Order.findById(orderB._id)).paymentStatus, "COLLECTED");
    assert.equal((await Checkout.findById(multiCodId)).paymentStatus, "COLLECTED");

    const collectFirstListing = await createListing(sellerA, "COD thu trước khi nhận", 29000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: collectFirstListing._id } });
    const collectFirstCheckout = await createCheckout([collectFirstListing], "COD", "checkout-key-collect-first");
    const collectFirstOrder = await Order.findOne({ checkoutId: collectFirstCheckout.data.data.checkoutId });
    await request(`/orders/${collectFirstOrder._id}/shipment`, {
      user: sellerA, method: "PUT", body: { carrierName: "GHN", trackingCode: "GHN-29000" },
    });
    assert.equal((await request(`/orders/${collectFirstOrder._id}/cod-collection`, {
      user: sellerA, method: "POST", body: { amount: 29000 }, idempotencyKey: "cod-collect-first",
    })).response.status, 201);
    const receivedAfterCollection = await request(`/orders/${collectFirstOrder._id}/receipt-confirmation`, {
      user: buyer, method: "POST", body: {}, idempotencyKey: "receipt-after-collection",
    });
    assert.equal(receivedAfterCollection.response.status, 200);
    assert.equal(receivedAfterCollection.data.data.status, "COMPLETED");
    assert.equal(receivedAfterCollection.data.data.paymentStatus, "COLLECTED");

    const returnListing = await createListing(sellerB, "COD yêu cầu hoàn", 28000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: returnListing._id } });
    const returnCheckout = await createCheckout([returnListing], "COD", "checkout-key-0011");
    const returnOrder = await Order.findOne({ checkoutId: returnCheckout.data.data.checkoutId });
    await Listing.updateOne({ _id: returnListing._id }, { $set: { sellerHidden: true } });
    await request(`/orders/${returnOrder._id}/shipment`, {
      user: sellerB,
      method: "PUT",
      body: { carrierName: "GHN", trackingCode: "GHN-56789" },
    });
    const returnRequest = await request(`/orders/${returnOrder._id}/cod-return-requests`, {
      user: sellerB,
      method: "POST",
      body: { reason: "Buyer declined delivery and the item is being returned." },
      idempotencyKey: "cod-return-0001",
    });
    assert.equal(returnRequest.response.status, 201);
    assert.equal((await Order.findById(returnOrder._id)).status, "NEEDS_REVIEW");
    assert.equal((await Listing.findById(returnListing._id)).saleStatus, "SOLD");
    const acceptedReturn = await request(`/admin/orders/${returnOrder._id}/cod-return-decisions`, {
      user: admin,
      method: "POST",
      body: {
        requestId: returnRequest.data.data.requestId,
        decision: "ACCEPT_RETURN",
        reason: "Hàng đã về nguyên vẹn, đối chiếu đủ và chưa thu tiền.",
      },
      idempotencyKey: "cod-return-decision-0001",
    });
    assert.equal(acceptedReturn.response.status, 200);
    assert.equal((await Order.findById(returnOrder._id)).status, "RETURNED");
    assert.equal((await Listing.findById(returnListing._id)).saleStatus, "AVAILABLE");
    assert.equal((await Listing.findById(returnListing._id)).sellerHidden, true);

    const cancelRaceListing = await createListing(sellerA, "COD đua hủy giao", 39000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: cancelRaceListing._id } });
    const cancelRaceCheckout = await createCheckout([cancelRaceListing], "COD", "checkout-key-0012");
    const cancelRaceOrder = await Order.findOne({ checkoutId: cancelRaceCheckout.data.data.checkoutId });
    const [cancelRaceResult, shipRaceResult] = await Promise.all([
      request(`/orders/${cancelRaceOrder._id}/cancel`, {
        user: buyer, method: "POST", body: {}, idempotencyKey: "cod-cancel-race-0001",
      }),
      request(`/orders/${cancelRaceOrder._id}/shipment`, {
        user: sellerA, method: "PUT", body: { carrierName: "GHN", trackingCode: "GHN-RACE-1" },
      }),
    ]);
    const cancelRaceFinal = await Order.findById(cancelRaceOrder._id);
    if (cancelRaceFinal.status === "CANCELLED") {
      assert.ok(cancelRaceResult.response.ok);
      assert.equal(shipRaceResult.response.status, 409);
      assert.equal((await Listing.findById(cancelRaceListing._id)).saleStatus, "AVAILABLE");
    } else {
      assert.equal(cancelRaceFinal.status, "CONFIRMED");
      assert.equal(cancelRaceFinal.shippedAt instanceof Date, true);
      assert.equal(cancelRaceResult.response.status, 409);
      assert.ok(shipRaceResult.response.ok);
      assert.equal((await Listing.findById(cancelRaceListing._id)).saleStatus, "SOLD");
    }

    const expiryListing = await createListing(sellerB, "Áo hết hạn", 30000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: expiryListing._id } });
    const expiryCheckoutResult = await createCheckout([expiryListing], "VNPAY", "checkout-key-0005");
    const expiryCheckoutId = expiryCheckoutResult.data.data.checkoutId;
    const expiredAt = new Date(Date.now() - 1000);
    await Checkout.collection.updateOne({ _id: new mongoose.Types.ObjectId(expiryCheckoutId) }, { $set: { expiresAt: expiredAt } });
    await Listing.collection.updateOne({ _id: expiryListing._id }, { $set: { reservedUntil: expiredAt } });
    await Cart.updateOne({ buyerId: secondBuyer._id }, { $addToSet: { listingIds: expiryListing._id } });
    assert.equal((await createCheckout([expiryListing], "VNPAY", "checkout-key-after-expiry", secondBuyer)).response.status, 409);
    assert.equal((await Listing.findById(expiryListing._id)).saleStatus, "RESERVED");
    assert.equal(await expireUnattemptedCheckouts(new Date()), 1);
    assert.equal((await Checkout.findById(expiryCheckoutId)).status, "EXPIRED");
    assert.equal((await Listing.findById(expiryListing._id)).saleStatus, "AVAILABLE");
    assert.equal((await Checkout.findById(codResult.data.data.checkoutId)).status, "CONFIRMED");

    const checkpointListing = await createListing(sellerB, "Áo checkpoint", 32000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: checkpointListing._id } });
    const checkpointCheckout = await createCheckout([checkpointListing], "VNPAY", "checkout-key-0006");
    const checkpointAttempt = await createAttempt(checkpointCheckout.data.data.checkoutId, "attempt-key-0006");
    const dueAt = new Date(Date.now() - 1000);
    await PaymentAttempt.updateOne({ _id: checkpointAttempt.data.data.attemptId }, {
      $set: { "reconciliation.nextAt": dueAt, "reconciliation.checkpoint": "PLUS_1_MIN" },
    });
    const claimed = await claimDueAttempt(new Date());
    assert.equal(String(claimed._id), checkpointAttempt.data.data.attemptId);
    await processClaimedAttempt(claimed, { version: "2.1.0" }, new Date());
    const scheduled = await PaymentAttempt.findById(checkpointAttempt.data.data.attemptId);
    assert.equal(scheduled.reconciliation.checkpoint, "PLUS_3_MIN");
    assert.equal(scheduled.reconciliation.leaseId, "");
    await PaymentAttempt.updateOne({ _id: checkpointAttempt.data.data.attemptId }, {
      $set: {
        "reconciliation.nextAt": new Date(Date.now() - 1000),
        "reconciliation.checkpoint": "PLUS_3_MIN",
        "reconciliation.leaseUntil": new Date(Date.now() - 1000),
      },
    });
    const claimedPlus3 = await claimDueAttempt(new Date());
    await processClaimedAttempt(claimedPlus3, { version: "2.1.0" }, new Date());
    const scheduledPlus5 = await PaymentAttempt.findById(checkpointAttempt.data.data.attemptId);
    assert.equal(scheduledPlus5.reconciliation.checkpoint, "PLUS_5_MIN");
    assert.equal(scheduledPlus5.reconciliation.leaseId, "");

    const timeoutListing = await createListing(sellerB, "Áo QueryDr timeout", 33000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: timeoutListing._id } });
    const timeoutCheckout = await createCheckout([timeoutListing], "VNPAY", "checkout-key-query-timeout");
    const timeoutAttempt = await createAttempt(timeoutCheckout.data.data.checkoutId, "attempt-key-query-timeout");
    const timeoutNow = new Date();
    await PaymentAttempt.updateOne({ _id: timeoutAttempt.data.data.attemptId }, {
      $set: {
        "reconciliation.nextAt": new Date(timeoutNow.getTime() - 1000),
        "reconciliation.checkpoint": "EXPIRY",
        "reconciliation.leaseId": "query-timeout-worker",
        "reconciliation.leaseUntil": new Date(timeoutNow.getTime() + 60_000),
      },
    });
    const timeoutDoc = await PaymentAttempt.findById(timeoutAttempt.data.data.attemptId);
    const fetchBeforeTimeout = global.fetch;
    try {
      global.fetch = async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
      await processClaimedAttempt(timeoutDoc, loadVnpayConfig(), timeoutNow);
    } finally {
      global.fetch = fetchBeforeTimeout;
    }
    assert.equal((await PaymentAttempt.findById(timeoutAttempt.data.data.attemptId)).status, "PENDING");
    assert.equal((await Listing.findById(timeoutListing._id)).saleStatus, "RESERVED");
    assert.equal((await PaymentAttempt.findById(timeoutAttempt.data.data.attemptId)).reconciliation.checkpoint, "PLUS_1_MIN");

    const throttledListing = await createListing(sellerB, "Áo QueryDr sau restart", 34000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: throttledListing._id } });
    const throttledCheckout = await createCheckout([throttledListing], "VNPAY", "checkout-key-throttled");
    const throttledAttempt = await createAttempt(throttledCheckout.data.data.checkoutId, "attempt-key-throttled");
    const throttleNow = new Date();
    const lastQueryAt = new Date(throttleNow.getTime() - 2 * 60 * 1000);
    await PaymentAttempt.updateOne({ _id: throttledAttempt.data.data.attemptId }, {
      $set: {
        "reconciliation.nextAt": new Date(throttleNow.getTime() - 1000),
        "reconciliation.checkpoint": "PLUS_5_MIN",
        "reconciliation.lastRequestedAt": lastQueryAt,
        "reconciliation.leaseId": "stopped-worker",
        "reconciliation.leaseUntil": new Date(throttleNow.getTime() - 1000),
      },
    });
    const reclaimed = await claimDueAttempt(throttleNow);
    assert.equal(String(reclaimed._id), throttledAttempt.data.data.attemptId);
    const priorFetch = global.fetch;
    try {
      global.fetch = async () => { throw new Error("QueryDr must remain throttled after worker restart."); };
      assert.equal(await processClaimedAttempt(reclaimed, {}, throttleNow), "QUERY_THROTTLED");
    } finally {
      global.fetch = priorFetch;
    }
    const throttled = await PaymentAttempt.findById(throttledAttempt.data.data.attemptId);
    assert.equal(throttled.status, "PENDING");
    assert.equal(throttled.reconciliation.checkpoint, "PLUS_5_MIN");
    assert.equal(throttled.reconciliation.nextAt.getTime(), lastQueryAt.getTime() + 5 * 60 * 1000 + 10_000);
    assert.equal(throttled.reconciliation.leaseId, "");

    async function processMockQuery(attemptId, { responseCode, transactionStatus, transactionNo }) {
      const attempt = await PaymentAttempt.findById(attemptId);
      const queryNow = new Date();
      const responseFields = {
        vnp_ResponseId: `RESP${randomUUID().replaceAll("-", "").slice(0, 16)}`,
        vnp_Command: "querydr",
        vnp_ResponseCode: responseCode,
        vnp_Message: responseCode === "00" ? "Query success" : "Transaction not found",
        vnp_TmnCode: process.env.VNPAY_TMN_CODE,
        vnp_TxnRef: attempt.merchantReference,
        vnp_Amount: String(attempt.amount * 100),
        vnp_BankCode: "NCB",
        vnp_PayDate: "20261029120000",
        vnp_TransactionNo: transactionNo,
        vnp_TransactionType: "01",
        vnp_TransactionStatus: transactionStatus,
        vnp_OrderInfo: `Query transaction ${attempt.merchantReference}`,
        vnp_PromotionCode: "",
        vnp_PromotionAmount: "",
      };
      responseFields.vnp_SecureHash = hashQueryDrResponse(responseFields, process.env.VNPAY_HASH_SECRET);
      const originalFetch = global.fetch;
      let sentRequest;
      try {
        global.fetch = async (url, options) => {
          assert.equal(url, "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction");
          sentRequest = JSON.parse(options.body);
          return new Response(JSON.stringify(responseFields), { status: 200 });
        };
        await processClaimedAttempt(attempt, loadVnpayConfig(), queryNow);
      } finally {
        global.fetch = originalFetch;
      }
      assert.equal(sentRequest.vnp_Command, "querydr");
      assert.equal(sentRequest.vnp_TxnRef, attempt.merchantReference);
    }

    const querySuccessListing = await createListing(sellerA, "QueryDr xác nhận thành công", 36000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: querySuccessListing._id } });
    const querySuccessCheckout = await createCheckout([querySuccessListing], "VNPAY", "checkout-key-0013");
    const querySuccessAttempt = await createAttempt(querySuccessCheckout.data.data.checkoutId, "attempt-key-0008");
    await PaymentAttempt.updateOne({ _id: querySuccessAttempt.data.data.attemptId }, {
      $set: { "reconciliation.checkpoint": "EXPIRY", "reconciliation.leaseId": "query-success-test", "reconciliation.leaseUntil": new Date(Date.now() + 60000) },
    });
    await processMockQuery(querySuccessAttempt.data.data.attemptId, {
      responseCode: "00", transactionStatus: "00", transactionNo: "423456789",
    });
    assert.equal((await PaymentAttempt.findById(querySuccessAttempt.data.data.attemptId)).status, "SUCCESS");
    assert.equal((await Checkout.findById(querySuccessCheckout.data.data.checkoutId)).status, "PAID");
    assert.equal((await Listing.findById(querySuccessListing._id)).saleStatus, "SOLD");
    const querySuccessRecord = await PaymentAttempt.findById(querySuccessAttempt.data.data.attemptId);
    const { payloadKey, settleVerifiedResult } = require("../src/services/paymentSettlement");
    const crossChannelKey = payloadKey("QUERY", "same-verified-transaction");
    const crossChannel = await settleVerifiedResult({
      eventKey: crossChannelKey,
      requestId: "query-after-ipn-test",
      merchantReference: querySuccessRecord.merchantReference,
      tmnCode: process.env.VNPAY_TMN_CODE,
      expectedTmnCode: process.env.VNPAY_TMN_CODE,
      amount: querySuccessRecord.amount * 100,
      responseCode: "00",
      transactionStatus: "00",
      providerTransactionNo: querySuccessRecord.providerTransactionNo,
      resultType: "SUCCESS",
      event: {
        source: "QUERY", eventKey: crossChannelKey, requestId: "query-after-ipn-test",
        merchantReference: querySuccessRecord.merchantReference,
        providerTransactionNo: querySuccessRecord.providerTransactionNo,
        signatureStatus: "VALID", payloadHash: crossChannelKey,
        responseCode: "00", transactionStatus: "00",
      },
    });
    assert.equal(crossChannel.ackCode, "02");
    assert.equal((await PaymentAttempt.findById(querySuccessAttempt.data.data.attemptId)).status, "SUCCESS");
    assert.equal((await Listing.findById(querySuccessListing._id)).paymentReviewHold, false);

    const queryUnknownListing = await createListing(sellerA, "QueryDr chưa có kết quả", 37000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: queryUnknownListing._id } });
    const queryUnknownCheckout = await createCheckout([queryUnknownListing], "VNPAY", "checkout-key-0014");
    const queryUnknownAttempt = await createAttempt(queryUnknownCheckout.data.data.checkoutId, "attempt-key-0009");
    await PaymentAttempt.updateOne({ _id: queryUnknownAttempt.data.data.attemptId }, {
      $set: {
        "reconciliation.checkpoint": "PLUS_5_MIN",
        "reconciliation.lastRequestedAt": new Date(Date.now() - 6 * 60 * 1000),
        "reconciliation.leaseId": "query-unknown-test",
        "reconciliation.leaseUntil": new Date(Date.now() + 60000),
      },
    });
    await processMockQuery(queryUnknownAttempt.data.data.attemptId, {
      responseCode: "94", transactionStatus: "01", transactionNo: "0",
    });
    assert.equal((await PaymentAttempt.findById(queryUnknownAttempt.data.data.attemptId)).status, "NEEDS_REVIEW");
    assert.equal((await Checkout.findById(queryUnknownCheckout.data.data.checkoutId)).status, "NEEDS_REVIEW");
    const stillHeldListing = await Listing.findById(queryUnknownListing._id);
    assert.equal(stillHeldListing.saleStatus, "RESERVED");
    assert.equal(stillHeldListing.paymentReviewHold, true);

    const competingListing = await createListing(sellerA, "Áo hai Buyer cùng giữ", 55000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: competingListing._id } });
    await Cart.updateOne({ buyerId: secondBuyer._id }, { $addToSet: { listingIds: competingListing._id } });
    const competingCheckouts = await Promise.all([
      createCheckout([competingListing], "VNPAY", "checkout-key-0007", buyer),
      createCheckout([competingListing], "VNPAY", "checkout-key-0008", secondBuyer),
    ]);
    assert.deepEqual(competingCheckouts.map((result) => result.response.status).sort(), [201, 409]);
    assert.equal(await Checkout.countDocuments({ "items.listingId": competingListing._id }), 1);

    const cancellationListing = await createListing(sellerB, "Áo hủy đua attempt", 33000);
    await Cart.updateOne({ buyerId: buyer._id }, { $addToSet: { listingIds: cancellationListing._id } });
    const cancellationCheckout = await createCheckout([cancellationListing], "VNPAY", "checkout-key-0009");
    const cancellationCheckoutId = cancellationCheckout.data.data.checkoutId;
    const [racingAttempt, racingCancel] = await Promise.all([
      createAttempt(cancellationCheckoutId, "attempt-key-0007"),
      request(`/checkouts/${cancellationCheckoutId}/cancel`, {
        user: buyer,
        method: "POST",
        body: {},
        idempotencyKey: "cancel-key-0001",
      }),
    ]);
    const finalCheckout = await Checkout.findById(cancellationCheckoutId);
    const finalAttempt = await PaymentAttempt.findOne({ checkoutId: cancellationCheckoutId });
    if (finalCheckout.status === "CANCELLED") {
      assert.ok(racingCancel.response.ok);
      assert.equal(racingAttempt.response.status, 409);
      assert.equal(finalAttempt, null);
      assert.equal((await Listing.findById(cancellationListing._id)).saleStatus, "AVAILABLE");
    } else {
      assert.equal(finalCheckout.status, "PENDING_PAYMENT");
      assert.ok(racingAttempt.response.ok);
      assert.equal(racingCancel.response.status, 409);
      assert.ok(finalAttempt);
      assert.equal((await Listing.findById(cancellationListing._id)).saleStatus, "RESERVED");
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
