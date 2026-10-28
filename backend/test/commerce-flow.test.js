const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const mongoUri = process.env.MONGODB_TEST_URI;

test("register listing, add to cart, checkout, and create order", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database ending in _test",
}, async () => {
  const { URL } = require("node:url");
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  process.env.MONGODB_URI = mongoUri;
  process.env.SESSION_SECRET = "integration-test-session-secret";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "1025";
  process.env.MAIL_FROM = "Rewear Circle <test@rewear.local>";

  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const express = require("express");
  const User = require("../src/models/User");
  const Media = require("../src/models/Media");
  const Listing = require("../src/models/Listing");
  const { Cart, Checkout, Order } = require("../src/models/commerce");

  await mongoose.connect(mongoUri);
  const models = [User, Media, Listing, Cart, Checkout, Order];
  const sessions = new Map();
  let server;

  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));

    const password = "TestPassword123!";
    const [seller, buyer] = await User.create([
      {
        email: "seller@rewear.test",
        passwordHash: await bcrypt.hash(password, 4),
        displayName: "Seller",
        emailVerifiedAt: new Date(),
      },
      {
        email: "buyer@rewear.test",
        passwordHash: await bcrypt.hash(password, 4),
        displayName: "Buyer",
        emailVerifiedAt: new Date(),
      },
    ]);
    const media = await Media.create({
      ownerId: seller._id,
      filename: "test.png",
      mimeType: "image/png",
      size: 8,
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const id = req.headers.cookie?.match(/rewear\.sid=([^;]+)/)?.[1];
      let currentId = id;
      function attachSession(session) {
        session.regenerate = (callback) => {
          currentId = randomUUID();
          session = {};
          sessions.set(currentId, session);
          req.session = attachSession(session);
          res.setHeader("Set-Cookie", `rewear.sid=${currentId}; Path=/; HttpOnly; SameSite=Lax`);
          callback();
        };
        session.save = (callback) => {
          if (currentId) sessions.set(currentId, session);
          callback();
        };
        session.destroy = (callback) => {
          if (currentId) sessions.delete(currentId);
          callback();
        };
        return session;
      };
      req.session = attachSession(sessions.get(id) || {});
      req.requestId = randomUUID();
      next();
    });
    app.use("/api/v1", require("../src/routes/auth"));
    app.use("/api/v1", require("../src/routes/listings"));
    app.use("/api/v1", require("../src/routes/commerce"));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      res.status(error.status || 500).json({ error: { code: error.code || "INTERNAL_ERROR" } });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    async function request(path, { method = "GET", cookie, body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json", origin: process.env.APP_ORIGIN } : {}),
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        response,
        data: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    }

    async function login(email) {
      const result = await request("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      assert.equal(result.response.status, 200);
      return result.cookie;
    }

    assert.equal((await request("/me")).response.status, 401);

    const sellerCookie = await login(seller.email);
    const created = await request("/listings", {
      method: "POST",
      cookie: sellerCookie,
      body: {
        title: "Áo sơ mi cũ còn tốt",
        category: "Áo",
        size: "M",
        condition: "Còn tốt",
        description: "Áo sạch, không rách, phù hợp để dùng hằng ngày.",
        flaws: "",
        price: 120000,
        shipFrom: "Hồ Chí Minh",
        imageIds: [String(media._id)],
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.data.status, "PENDING");

    const listing = await Listing.findById(created.data.data.listingId);
    listing.versions[0].status = "APPROVED";
    listing.approvedVersionId = listing.versions[0]._id;
    listing.reviewHold = false;
    await listing.save();

    const buyerCookie = await login(buyer.email);
    const added = await request("/cart/items", {
      method: "POST",
      cookie: buyerCookie,
      body: { listingId: String(listing._id) },
    });
    assert.equal(added.response.status, 200);

    const checkoutInput = {
      listingIds: [String(listing._id)],
      requestKey: "flow-test-key-001",
    };
    const checkoutResult = await request("/checkouts", {
      method: "POST",
      cookie: buyerCookie,
      body: checkoutInput,
    });
    assert.equal(checkoutResult.response.status, 201);
    const repeated = await request("/checkouts", {
      method: "POST",
      cookie: buyerCookie,
      body: checkoutInput,
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.data.data._id, checkoutResult.data.data._id);

    const invalidAddress = await request(`/checkouts/${checkoutResult.data.data._id}/confirm`, {
      method: "POST",
      cookie: buyerCookie,
      body: { shippingAddress: {} },
    });
    assert.equal(invalidAddress.response.status, 422);

    const confirmationInput = {
      shippingAddress: {
        fullName: "Nguyen Van B",
        phone: "+84901234567",
        address: "123 Nguyen Hue, District 1",
      },
    };
    const confirmPath = `/checkouts/${checkoutResult.data.data._id}/confirm`;
    const confirmed = await request(confirmPath, {
      method: "POST",
      cookie: buyerCookie,
      body: confirmationInput,
    });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.data.data.length, 1);
    assert.equal(confirmed.data.data[0].total, 120000);

    const repeatedConfirmation = await request(confirmPath, {
      method: "POST",
      cookie: buyerCookie,
      body: confirmationInput,
    });
    assert.equal(repeatedConfirmation.response.status, 200);
    assert.equal(repeatedConfirmation.data.data[0]._id, confirmed.data.data[0]._id);

    assert.equal((await Listing.findById(listing._id)).saleStatus, "SOLD");
    assert.equal((await Checkout.findById(checkoutResult.data.data._id)).status, "COMPLETED");
    assert.equal((await Order.countDocuments({ checkoutId: checkoutResult.data.data._id })), 1);

    const cart = await request("/cart", { cookie: buyerCookie });
    assert.equal(cart.data.data.items.length, 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
