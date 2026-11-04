const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoUri = process.env.MONGODB_TEST_URI;

test(
  "commerce regression: multi-seller, cancellation, return, race and audit rollback",
  {
    skip:
      !mongoUri &&
      "Set MONGODB_TEST_URI to a private replica-set database ending in _test",
  },
  async (t) => {
    assert.match(new URL(mongoUri).pathname, /_test$/);
    const mongoose = require("mongoose");
    const express = require("express");
    const User = require("../src/models/User");
    const Listing = require("../src/models/Listing");
    const AuditEvent = require("../src/models/AuditEvent");
    const Case = require("../src/models/Case");
    const {
      Cart,
      Checkout,
      Order,
      CodCollection,
      CodReturnRequest,
    } = require("../src/models/commerce");
    const models = [
      User,
      Listing,
      AuditEvent,
      Case,
      Cart,
      Checkout,
      Order,
      CodCollection,
      CodReturnRequest,
    ];
    let server;
    await mongoose.connect(mongoUri);
    try {
      await Promise.all(models.map((Model) => Model.deleteMany({})));
      await Promise.all(models.map((Model) => Model.init()));
      const users = {};
      for (const key of ["buyer1", "buyer2", "seller1", "seller2", "admin"]) {
        users[key] = await User.create({
          email: `${key}@commerce-regression.test`,
          passwordHash: "unused",
          displayName: key,
          role: key === "admin" ? "ADMIN" : "USER",
          emailVerifiedAt: new Date(),
        });
      }
      async function listing(seller, price) {
        const item = new Listing({
          ownerId: seller._id,
          reviewHold: false,
          versions: [
            {
              title: "Commerce regression item",
              category: "\u00c1o",
              size: "M",
              condition: "Good",
              description: "A fixture item used by commerce regression checks.",
              price,
              shipFrom: "Test city",
              imageIds: [],
              status: "APPROVED",
            },
          ],
        });
        item.approvedVersionId = item.versions[0]._id;
        return item.save();
      }
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.requestId = randomUUID();
        req.session = { userId: req.get("x-test-user-id") };
        next();
      });
      app.use("/api/v1", require("../src/routes/commerce"));
      app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        res
          .status(error.status || 500)
          .json({ error: { code: error.code || "INTERNAL_ERROR" } });
      });
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}/api/v1`;
      async function request(
        route,
        user,
        method = "GET",
        body,
        key = randomUUID(),
      ) {
        const response = await fetch(base + route, {
          method,
          headers: {
            "x-test-user-id": String(user._id),
            "Idempotency-Key": key,
            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        return { response, json: await response.json() };
      }
      const checkoutBody = (items) => ({
        paymentMethod: "COD",
        recipientName: "Test Buyer",
        recipientPhone: "+84901234567",
        recipientAddress: "123 Test Street, Test City",
        items: items.map((item) => ({
          listingId: String(item._id),
          expectedVersionId: String(item.approvedVersionId),
          expectedPrice: item.versions[0].price,
        })),
      });
      const first = await listing(users.seller1, 120000);
      const second = await listing(users.seller2, 80000);
      await Cart.create({
        buyerId: users.buyer1._id,
        listingIds: [first._id, second._id],
      });
      let checkoutId;
      let orders;
      await t.test(
        "one checkout creates one immutable order per seller; replay does not duplicate",
        async () => {
          const key = randomUUID();
          const body = checkoutBody([first, second]);
          const created = await request(
            "/checkouts",
            users.buyer1,
            "POST",
            body,
            key,
          );
          assert.equal(
            created.response.status,
            201,
            JSON.stringify(created.json),
          );
          checkoutId = created.json.data.checkoutId;
          orders = await Order.find({ checkoutId });
          assert.equal(orders.length, 2);
          assert.equal(
            new Set(orders.map((order) => String(order.sellerId))).size,
            2,
          );
          assert.equal(
            orders.reduce((sum, order) => sum + order.total, 0),
            200000,
          );
          assert.equal(
            (await request("/checkouts", users.buyer1, "POST", body, key))
              .response.status,
            200,
          );
          assert.equal(await Order.countDocuments({ checkoutId }), 2);
          await Listing.updateOne(
            { _id: first._id },
            { $set: { "versions.0.price": 130000 } },
          );
          assert.equal(
            (await Order.findOne({ checkoutId, sellerId: users.seller1._id }))
              .items[0].price,
            120000,
          );
        },
      );
      await t.test(
        "partial cancellation releases only its seller's items and updates COD totals",
        async () => {
          const order = orders.find(
            (item) => String(item.sellerId) === String(users.seller1._id),
          );
          const key = randomUUID();
          assert.equal(
            (
              await request(
                `/orders/${order._id}/cancel`,
                users.buyer1,
                "POST",
                {},
                key,
              )
            ).response.status,
            200,
          );
          assert.equal(
            (
              await request(
                `/orders/${order._id}/cancel`,
                users.buyer1,
                "POST",
                {},
                key,
              )
            ).response.status,
            200,
          );
          assert.equal(
            (await Listing.findById(first._id)).saleStatus,
            "AVAILABLE",
          );
          assert.equal((await Listing.findById(second._id)).saleStatus, "SOLD");
          const checkout = await Checkout.findById(checkoutId);
          assert.equal(checkout.collectibleAmount, 80000);
          assert.equal(checkout.outstandingAmount, 80000);
          assert.equal(checkout.status, "CONFIRMED");
          assert.equal(
            await AuditEvent.countDocuments({
              targetId: order._id,
              action: "COD_ORDER_CANCELLED",
            }),
            1,
          );
        },
      );
      await t.test(
        "shipment and accepted COD return release ownership once",
        async () => {
          const order = orders.find(
            (item) => String(item.sellerId) === String(users.seller2._id),
          );
          assert.equal(
            (
              await request(
                `/orders/${order._id}/shipment`,
                users.seller2,
                "PUT",
                {
                  carrierName: "Test Carrier",
                  trackingCode: "TRACK-RETURN-01",
                },
              )
            ).response.status,
            200,
          );
          assert.equal(
            (
              await request(
                `/orders/${order._id}/cancel`,
                users.buyer1,
                "POST",
                {},
              )
            ).response.status,
            409,
          );
          const returned = await request(
            `/orders/${order._id}/cod-return-requests`,
            users.seller2,
            "POST",
            {
              reason: "All items have been physically returned to the seller.",
            },
          );
          assert.equal(
            returned.response.status,
            201,
            JSON.stringify(returned.json),
          );
          const body = {
            requestId: returned.json.data.requestId,
            decision: "ACCEPT_RETURN",
            reason: "Verified the complete return in this test fixture.",
          };
          const key = randomUUID();
          assert.equal(
            (
              await request(
                `/admin/orders/${order._id}/cod-return-decisions`,
                users.admin,
                "POST",
                body,
                key,
              )
            ).response.status,
            200,
          );
          assert.equal(
            (
              await request(
                `/admin/orders/${order._id}/cod-return-decisions`,
                users.admin,
                "POST",
                body,
                key,
              )
            ).response.status,
            200,
          );
          const updated = await Order.findById(order._id);
          assert.equal(updated.status, "RETURNED");
          assert.equal(updated.paymentStatus, "NOT_DUE");
          assert.equal(
            (await Listing.findById(second._id)).saleStatus,
            "AVAILABLE",
          );
          assert.equal(
            (await Checkout.findById(checkoutId)).collectibleAmount,
            0,
          );
          assert.equal(
            await AuditEvent.countDocuments({ action: "COD_RETURN_ACCEPTED" }),
            1,
          );
        },
      );
      await t.test(
        "two concurrent buyers cannot both purchase the same item",
        async () => {
          const item = await listing(users.seller1, 90000);
          for (const buyer of [users.buyer1, users.buyer2]) {
            await Cart.updateOne(
              { buyerId: buyer._id },
              { $set: { listingIds: [item._id] } },
              { upsert: true },
            );
          }
          const results = await Promise.all(
            [users.buyer1, users.buyer2].map((buyer) =>
              request("/checkouts", buyer, "POST", checkoutBody([item])),
            ),
          );
          assert.deepEqual(
            results.map((result) => result.response.status).sort(),
            [201, 409],
          );
          assert.equal(
            await Order.countDocuments({ "items.listingId": item._id }),
            1,
          );
          assert.equal((await Listing.findById(item._id)).saleStatus, "SOLD");
        },
      );
      await t.test(
        "audit failure rolls back checkout, orders, stock and cart changes",
        async () => {
          const item = await listing(users.seller1, 70000);
          await Cart.updateOne(
            { buyerId: users.buyer1._id },
            { $set: { listingIds: [item._id] } },
          );
          const before = await Checkout.countDocuments({});
          const original = AuditEvent.create;
          try {
            AuditEvent.create = async () => {
              throw new Error("synthetic audit failure");
            };
            assert.equal(
              (
                await request(
                  "/checkouts",
                  users.buyer1,
                  "POST",
                  checkoutBody([item]),
                )
              ).response.status,
              500,
            );
          } finally {
            AuditEvent.create = original;
          }
          assert.equal(await Checkout.countDocuments({}), before);
          assert.equal(
            await Order.countDocuments({ "items.listingId": item._id }),
            0,
          );
          assert.equal(
            (await Listing.findById(item._id)).saleStatus,
            "AVAILABLE",
          );
          assert.ok(
            (await Cart.findOne({ buyerId: users.buyer1._id })).listingIds.some(
              (id) => String(id) === String(item._id),
            ),
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await Promise.all(models.map((Model) => Model.deleteMany({})));
      await mongoose.disconnect();
    }
  },
);
