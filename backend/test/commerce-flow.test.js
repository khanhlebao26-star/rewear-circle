const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const mongoUri = process.env.MONGODB_TEST_URI;

test("COD checkout, complaint, Support access, collection, and receipt", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database ending in _test",
}, async () => {
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  process.env.MONGODB_URI = mongoUri;
  process.env.SESSION_SECRET = "integration-test-session-secret";

  const mongoose = require("mongoose");
  const express = require("express");
  const User = require("../src/models/User");
  const Listing = require("../src/models/Listing");
  const Media = require("../src/models/Media");
  const Case = require("../src/models/Case");
  const Complaint = require("../src/models/Complaint");
  const ComplaintQuota = require("../src/models/ComplaintQuota");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const {
    Cart, Checkout, Order, CodCollection, CodReturnRequest,
  } = require("../src/models/commerce");
  const models = [
    User, Listing, Media, Case, Complaint, ComplaintQuota, AuditEvent, Notification,
    Cart, Checkout, Order, CodCollection, CodReturnRequest,
  ];
  let server;
  await mongoose.connect(mongoUri);

  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));

    const [seller, buyer, otherUser, admin, support] = await User.create([
      { email: "seller@fulfillment.test", passwordHash: "hash", displayName: "Seller", emailVerifiedAt: new Date() },
      { email: "buyer@fulfillment.test", passwordHash: "hash", displayName: "Buyer", emailVerifiedAt: new Date() },
      { email: "other@fulfillment.test", passwordHash: "hash", displayName: "Other", emailVerifiedAt: new Date() },
      { email: "admin@fulfillment.test", passwordHash: "hash", displayName: "Admin", role: "ADMIN", emailVerifiedAt: new Date() },
      { email: "support@fulfillment.test", passwordHash: "hash", displayName: "Support", role: "SUPPORT", emailVerifiedAt: new Date() },
    ]);
    const listing = new Listing({
      ownerId: seller._id,
      versions: [{
        title: "Áo khoác test",
        category: "Áo",
        size: "M",
        condition: "Còn tốt",
        description: "Áo khoác đã qua sử dụng, còn sạch và dùng tốt.",
        flaws: "",
        price: 120000,
        shipFrom: "Hồ Chí Minh",
        imageIds: [],
        status: "APPROVED",
      }],
      reviewHold: false,
    });
    listing.approvedVersionId = listing.versions[0]._id;
    await listing.save();
    await Cart.create({ buyerId: buyer._id, listingIds: [listing._id] });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = randomUUID();
      req.session = { userId: req.get("x-test-user-id") };
      next();
    });
    app.use("/api/v1", require("../src/routes/commerce"));
    app.use("/api/v1", require("../src/routes/moderation"));
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

    const checkoutBody = (paymentMethod) => ({
      items: [{
        listingId: String(listing._id),
        expectedVersionId: String(listing.approvedVersionId),
        expectedPrice: 120000,
      }],
      recipientName: "Nguyen Van B",
      recipientPhone: "+84901234567",
      recipientAddress: "123 Nguyen Hue, District 1",
      paymentMethod,
    });
    const disabledVnpay = await request("/checkouts", {
      user: buyer,
      method: "POST",
      body: checkoutBody("VNPAY"),
      idempotencyKey: "vnpay-paused-1",
    });
    assert.equal(disabledVnpay.response.status, 422);
    assert.equal(disabledVnpay.data.error.code, "PAYMENT_METHOD_UNAVAILABLE");
    assert.equal((await Listing.findById(listing._id)).saleStatus, "AVAILABLE");

    const checkoutResult = await request("/checkouts", {
      user: buyer,
      method: "POST",
      body: checkoutBody("COD"),
      idempotencyKey: "checkout-cod-01",
    });
    assert.equal(checkoutResult.response.status, 201, JSON.stringify(checkoutResult.data));
    const checkoutId = checkoutResult.data.data.checkoutId;
    const orderId = checkoutResult.data.data.orderIds[0];
    let order = await Order.findById(orderId);
    assert.equal(order.status, "CONFIRMED");
    assert.equal(order.paymentStatus, "UNPAID");
    assert.equal((await Listing.findById(listing._id)).soldCheckoutId.toString(), checkoutId);

    const outsideOrder = await request(`/orders/${orderId}`, { user: otherUser });
    assert.equal(outsideOrder.response.status, 404);
    const activeCaseReceipt = await request(`/orders/${orderId}/complaints`, {
      user: buyer,
      method: "POST",
      body: { type: "DELIVERY", reasonCode: "SELLER_NOT_SHIPPED", details: "Seller chưa gửi đơn hàng của tôi." },
      idempotencyKey: "complaint-delivery-01",
    });
    assert.equal(activeCaseReceipt.response.status, 201, JSON.stringify(activeCaseReceipt.data));
    const complaintId = activeCaseReceipt.data.data.complaintId;
    const caseId = activeCaseReceipt.data.data.caseId;
    const replayComplaint = await request(`/orders/${orderId}/complaints`, {
      user: buyer,
      method: "POST",
      body: { type: "DELIVERY", reasonCode: "SELLER_NOT_SHIPPED", details: "Seller chưa gửi đơn hàng của tôi." },
      idempotencyKey: "complaint-delivery-01",
    });
    assert.equal(replayComplaint.response.status, 200);
    assert.equal(replayComplaint.data.data.complaintId, complaintId);
    assert.equal(await Complaint.countDocuments({ orderId }), 1);
    assert.equal(await Notification.countDocuments({ complaintId, type: "COMPLAINT_RECEIVED" }), 1);

    const wrongComplaintShape = await request(`/orders/${orderId}/complaints`, {
      user: buyer,
      method: "POST",
      body: {
        type: "DELIVERY", reasonCode: "SELLER_NOT_SHIPPED", details: "Seller chưa gửi đơn hàng của tôi.",
        affectedOrderItemIds: [String(order.items[0]._id)],
      },
      idempotencyKey: "complaint-invalid-01",
    });
    assert.equal(wrongComplaintShape.response.status, 422);

    const blockedShipment = await request(`/orders/${orderId}/shipment`, {
      user: seller,
      method: "PUT",
      body: { carrierName: "Carrier", trackingCode: "TRACK123" },
    });
    assert.equal(blockedShipment.response.status, 409);
    assert.equal((await Order.findById(orderId)).shippedAt, null);

    const adminQueue = await request("/admin/cases?type=DELIVERY&status=OPEN", { user: admin });
    assert.equal(adminQueue.response.status, 200);
    assert.equal(adminQueue.data.data.length, 1);
    assert.equal(adminQueue.data.data[0].complaintCount, 1);
    const initialVersion = adminQueue.data.data[0].version;
    const badAssignment = await request(`/admin/cases/${caseId}/assignment`, {
      user: admin,
      method: "PATCH",
      body: { assignedSupportId: String(support._id), expectedVersion: initialVersion - 1 },
      idempotencyKey: "assign-stale-01",
    });
    assert.equal(badAssignment.response.status, 409);

    const assigned = await request(`/admin/cases/${caseId}/assignment`, {
      user: admin,
      method: "PATCH",
      body: { assignedSupportId: String(support._id), expectedVersion: initialVersion },
      idempotencyKey: "assign-support-01",
    });
    assert.equal(assigned.response.status, 200, JSON.stringify(assigned.data));
    let caseVersion = assigned.data.data.version;

    const supportList = await request("/support/cases?type=DELIVERY", { user: support });
    assert.equal(supportList.response.status, 200);
    assert.equal(supportList.data.data[0].caseId, caseId);
    const supportDetail = await request(`/support/cases/${caseId}`, { user: support });
    assert.equal(supportDetail.response.status, 200, JSON.stringify(supportDetail.data));
    assert.equal("shippingAddress" in supportDetail.data.data.order, false);
    const contact = await request(`/support/cases/${caseId}/contact-access`, {
      user: support,
      method: "POST",
      body: { reason: "Xác minh thông tin giao nhận đơn này." },
    });
    assert.equal(contact.response.status, 200, JSON.stringify(contact.data));
    assert.equal(contact.data.data.shippingAddress.fullName, "Nguyen Van B");
    assert.equal(await AuditEvent.countDocuments({ caseId, action: "CASE_CONTACT_ACCESS_READ" }), 1);

    const unassigned = await request(`/admin/cases/${caseId}/assignment`, {
      user: admin,
      method: "PATCH",
      body: { assignedSupportId: null, expectedVersion: caseVersion },
      idempotencyKey: "unassign-support-01",
    });
    assert.equal(unassigned.response.status, 200);
    caseVersion = unassigned.data.data.version;
    assert.equal((await request(`/support/cases/${caseId}`, { user: support })).response.status, 404);
    const reassigned = await request(`/admin/cases/${caseId}/assignment`, {
      user: admin,
      method: "PATCH",
      body: { assignedSupportId: String(support._id), expectedVersion: caseVersion },
      idempotencyKey: "reassign-support-01",
    });
    assert.equal(reassigned.response.status, 200);
    caseVersion = reassigned.data.data.version;

    const reviewing = await request(`/admin/cases/${caseId}/decisions`, {
      user: admin,
      method: "POST",
      body: { status: "IN_REVIEW", expectedVersion: caseVersion },
      idempotencyKey: "case-review-01",
    });
    assert.equal(reviewing.response.status, 200, JSON.stringify(reviewing.data));
    caseVersion = reviewing.data.data.version;
    const closeBody = {
      status: "CLOSED",
      outcomeCode: "RESOLVED",
      outcomeSummary: "Seller đã được thông báo và sẽ tiếp tục giao đơn.",
      expectedVersion: caseVersion,
    };
    const closed = await request(`/admin/cases/${caseId}/decisions`, {
      user: admin,
      method: "POST",
      body: closeBody,
      idempotencyKey: "case-close-001",
    });
    assert.equal(closed.response.status, 200, JSON.stringify(closed.data));
    const replayClose = await request(`/admin/cases/${caseId}/decisions`, {
      user: admin,
      method: "POST",
      body: closeBody,
      idempotencyKey: "case-close-001",
    });
    assert.equal(replayClose.response.status, 200);
    assert.equal(replayClose.data.meta.idempotentReplay, true);
    assert.equal(await Notification.countDocuments({ caseId, type: "CASE_CLOSED" }), 1);
    order = await Order.findById(orderId);
    assert.equal(order.status, "CONFIRMED");
    assert.equal(order.paymentStatus, "UNPAID");
    assert.equal(order.shippedAt, null);

    const shipment = await request(`/orders/${orderId}/shipment`, {
      user: seller,
      method: "PUT",
      body: { carrierName: "Carrier", trackingCode: "TRACK123" },
    });
    assert.equal(shipment.response.status, 200, JSON.stringify(shipment.data));
    assert.ok(shipment.data.data.shippedAt);
    const shipmentReplay = await request(`/orders/${orderId}/shipment`, {
      user: seller,
      method: "PUT",
      body: { carrierName: "Carrier", trackingCode: "TRACK123" },
    });
    assert.equal(shipmentReplay.response.status, 200);
    assert.equal(await AuditEvent.countDocuments({ targetType: "ORDER", targetId: orderId, action: "ORDER_SHIPPED" }), 1);

    const collection = await request(`/orders/${orderId}/cod-collection`, {
      user: seller,
      method: "POST",
      body: { amount: 120000, note: "Thu đủ khi giao hàng." },
      idempotencyKey: "cod-collection-01",
    });
    assert.equal(collection.response.status, 201, JSON.stringify(collection.data));
    const collectionReplay = await request(`/orders/${orderId}/cod-collection`, {
      user: seller,
      method: "POST",
      body: { amount: 120000, note: "Thu đủ khi giao hàng." },
      idempotencyKey: "cod-collection-01",
    });
    assert.equal(collectionReplay.response.status, 200);
    assert.equal(await CodCollection.countDocuments({ orderId }), 1);
    order = await Order.findById(orderId);
    assert.equal(order.paymentStatus, "COLLECTED");

    const receipt = await request(`/orders/${orderId}/receipt-confirmation`, {
      user: buyer,
      method: "POST",
      body: {},
      idempotencyKey: "receipt-order-01",
    });
    assert.equal(receipt.response.status, 200, JSON.stringify(receipt.data));
    assert.equal(receipt.data.data.status, "COMPLETED");
    assert.equal(receipt.data.data.paymentStatus, "COLLECTED");
    const receivedAt = receipt.data.data.receivedAt;
    const receiptReplay = await request(`/orders/${orderId}/receipt-confirmation`, {
      user: buyer,
      method: "POST",
      body: {},
      idempotencyKey: "receipt-order-01",
    });
    assert.equal(receiptReplay.response.status, 200);
    assert.equal(receiptReplay.data.data.receivedAt, receivedAt);
    assert.equal(await AuditEvent.countDocuments({ targetType: "ORDER", targetId: orderId, action: "ORDER_RECEIVED" }), 1);

    const itemComplaint = await request(`/orders/${orderId}/complaints`, {
      user: buyer,
      method: "POST",
      body: {
        type: "ITEM",
        reasonCode: "WRONG_ITEM",
        details: "Món nhận được không đúng với mô tả trong đơn hàng.",
        affectedOrderItemIds: [String(order.items[0]._id)],
      },
      idempotencyKey: "complaint-item-001",
    });
    assert.equal(itemComplaint.response.status, 201, JSON.stringify(itemComplaint.data));
    assert.equal(itemComplaint.data.data.type, "ITEM");
    const buyerComplaints = await request(`/orders/${orderId}/complaints?type=ITEM`, { user: buyer });
    assert.equal(buyerComplaints.response.status, 200);
    assert.equal(buyerComplaints.data.data.length, 1);
    const buyerComplaint = await request(`/orders/${orderId}/complaints/${itemComplaint.data.data.complaintId}`, { user: buyer });
    assert.equal(buyerComplaint.response.status, 200);
    assert.equal(buyerComplaint.data.data.affectedOrderItemIds[0], String(order.items[0]._id));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
