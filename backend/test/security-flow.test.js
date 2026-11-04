const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHmac } = require("node:crypto");
const mongoUri = process.env.MONGODB_TEST_URI;

test(
  "security regression: review media, staff permissions, passwords and concurrent OTP",
  {
    skip:
      !mongoUri &&
      "Set MONGODB_TEST_URI to a private replica-set database ending in _test",
  },
  async (t) => {
    assert.match(new URL(mongoUri).pathname, /_test$/);
    const mongoose = require("mongoose");
    const bcrypt = require("bcrypt");
    process.env.MONGODB_URI = mongoUri;
    process.env.SESSION_SECRET = randomUUID() + randomUUID();
    process.env.APP_ORIGIN = "http://security.test";
    process.env.SMTP_HOST = "unused";
    process.env.SMTP_PORT = "1025";
    const mails = [];
    require("nodemailer").createTransport = () => ({
      sendMail: async (mail) => {
        mails.push(mail);
      },
    });
    const MongoStore = require("connect-mongo").default;
    const originalCreateStore = MongoStore.create;
    let store;
    MongoStore.create = (options) => {
      store = originalCreateStore.call(MongoStore, options);
      return store;
    };
    const User = require("../src/models/User");
    const Listing = require("../src/models/Listing");
    const Media = require("../src/models/Media");
    const AuditEvent = require("../src/models/AuditEvent");
    const Notification = require("../src/models/Notification");
    const filenames = [];
    const uploadDir = path.resolve(__dirname, "../uploads");
    let server;
    await mongoose.connect(mongoUri);
    try {
      const models = [User, Listing, Media, AuditEvent, Notification];
      await Promise.all(models.map((Model) => Model.deleteMany({})));
      await Promise.all(models.map((Model) => Model.init()));
      const password = "SecurityFixturePassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const users = {};
      for (const [key, role] of [
        ["seller", "USER"],
        ["admin", "ADMIN"],
        ["support", "SUPPORT"],
        ["otp", "USER"],
      ]) {
        users[key] = await User.create({
          email: `${key}@security.test`,
          displayName: key,
          passwordHash,
          role,
          emailVerifiedAt: key === "otp" ? null : new Date(),
        });
      }
      const app = require("../src/app");
      app.set("trust proxy", 1); // Local test IPs separate the independent rate-limit scenarios.
      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}/api/v1`;
      async function request(
        route,
        { method = "GET", body, form, cookie = "", ip = "203.0.113.10" } = {},
      ) {
        const response = await fetch(base + route, {
          method,
          headers: {
            Origin: process.env.APP_ORIGIN,
            "X-Forwarded-For": ip,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(body !== undefined
            ? { body: JSON.stringify(body) }
            : form
              ? { body: form }
              : {}),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        let json;
        try {
          json = JSON.parse(bytes.toString());
        } catch {}
        return { response, json, bytes };
      }
      async function login(user, ip = "203.0.113.10") {
        const result = await request("/auth/login", {
          method: "POST",
          ip,
          body: { email: user.email, password },
        });
        assert.equal(result.response.status, 200);
        return result.response.headers.get("set-cookie").split(";")[0];
      }
      const seller = await login(users.seller);
      const admin = await login(users.admin);
      const support = await login(users.support);
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      function imageForm(purpose = "LISTING") {
        const form = new FormData();
        form.set(
          "images",
          new Blob([png], { type: "image/png" }),
          "fixture.png",
        );
        form.set("purpose", purpose);
        return form;
      }
      async function upload(purpose = "LISTING") {
        const result = await request("/media/upload-requests", {
          method: "POST",
          cookie: seller,
          form: imageForm(purpose),
        });
        assert.equal(result.response.status, 201);
        const media = await Media.findById(result.json.data[0].mediaId);
        filenames.push(media.filename);
        return media;
      }
      const form = (imageId) => ({
        title: "Security review listing",
        category: "\u00c1o",
        size: "M",
        condition: "Good",
        description: "A test fixture with enough description text.",
        flaws: "",
        price: 120000,
        shipFrom: "Test city",
        imageIds: [String(imageId)],
      });
      const linked = await upload();
      const created = await request("/listings", {
        method: "POST",
        cookie: seller,
        body: form(linked._id),
      });
      assert.equal(created.response.status, 201);
      const versionId = created.json.data.versionId;

      await t.test(
        "Admin can read linked pending media; guests, Support, orphans and unrelated evidence cannot",
        async () => {
          assert.equal(
            (
              await request(`/admin/listing-versions/${versionId}`, {
                cookie: admin,
              })
            ).response.status,
            200,
          );
          const photo = await request(`/media/${linked._id}`, {
            cookie: admin,
          });
          assert.equal(photo.response.status, 200);
          assert.deepEqual(photo.bytes, png);
          assert.equal(
            photo.response.headers.get("cache-control"),
            "private, no-store",
          );
          assert.equal(
            await AuditEvent.countDocuments({
              actorId: users.admin._id,
              targetId: linked._id,
              action: "MEDIA_PRIVATE_READ",
            }),
            1,
          );
          assert.equal(
            (await request(`/media/${linked._id}`)).response.status,
            404,
          );
          assert.equal(
            (await request(`/media/${linked._id}`, { cookie: support }))
              .response.status,
            404,
          );
          const orphan = await upload();
          const evidence = await upload("CASE_EVIDENCE");
          assert.equal(
            (await request(`/media/${orphan._id}`, { cookie: admin })).response
              .status,
            404,
          );
          assert.equal(
            (await request(`/media/${evidence._id}`, { cookie: admin }))
              .response.status,
            404,
          );
          for (const purpose of ["CASE_EVIDENCE", "RETENTION_PENDING"]) {
            await Media.updateOne({ _id: evidence._id }, { $set: { purpose } });
            assert.equal((await request("/listings", {
              method: "POST", cookie: seller, body: form(evidence._id),
            })).response.status, 422, "Only LISTING media may be attached to listings.");
          }
          const original = AuditEvent.create;
          try {
            AuditEvent.create = async () => {
              throw new Error("synthetic audit failure");
            };
            const denied = await request(`/media/${linked._id}`, {
              cookie: admin,
            });
            assert.equal(denied.response.status, 500);
            assert.ok(denied.json.error);
          } finally {
            AuditEvent.create = original;
          }
          await User.updateOne(
            { _id: users.admin._id },
            { $set: { role: "USER" } },
          );
          assert.equal(
            (await request(`/media/${linked._id}`, { cookie: admin })).response
              .status,
            404,
          );
          await User.updateOne(
            { _id: users.admin._id },
            { $set: { role: "ADMIN" } },
          );
        },
      );

      await t.test(
        "staff cannot create, revise, hide listings or upload; Admin still reviews other sellers",
        async () => {
          for (const cookie of [admin, support]) {
            assert.equal(
              (
                await request("/listings", {
                  method: "POST",
                  cookie,
                  body: form(linked._id),
                })
              ).response.status,
              403,
            );
            assert.equal(
              (
                await request(
                  `/listings/${created.json.data.listingId}/revisions`,
                  { method: "POST", cookie, body: form(linked._id) },
                )
              ).response.status,
              403,
            );
            assert.equal(
              (
                await request(
                  `/listings/${created.json.data.listingId}/visibility`,
                  { method: "POST", cookie, body: { action: "HIDE" } },
                )
              ).response.status,
              403,
            );
            assert.equal(
              (await request("/me/listings", { cookie })).response.status,
              403,
            );
            assert.equal(
              (
                await request("/media/upload-requests", {
                  method: "POST",
                  cookie,
                  form: imageForm(),
                })
              ).response.status,
              403,
            );
          }
          const legacy = await Listing.create({
            ownerId: users.admin._id,
            versions: [{ ...form(linked._id), status: "PENDING" }],
          });
          const self = await request(
            `/admin/listing-versions/${legacy.versions[0]._id}/decision`,
            { method: "POST", cookie: admin, body: { decision: "APPROVE" } },
          );
          assert.equal(self.response.status, 403);
          assert.equal(self.json.error.code, "SELF_REVIEW_FORBIDDEN");
          const originalNotify = Notification.create;
          try {
            Notification.create = async () => {
              throw new Error("synthetic notification failure");
            };
            assert.equal(
              (
                await request(`/admin/listing-versions/${versionId}/decision`, {
                  method: "POST",
                  cookie: admin,
                  body: { decision: "APPROVE" },
                })
              ).response.status,
              500,
            );
            assert.equal(
              (await Listing.findById(created.json.data.listingId)).versions.id(
                versionId,
              ).status,
              "PENDING",
            );
            assert.equal(
              await AuditEvent.countDocuments({
                action: "LISTING_APPROVED",
                targetId: versionId,
              }),
              0,
            );
          } finally {
            Notification.create = originalNotify;
          }
          assert.equal(
            (
              await request(`/admin/listing-versions/${versionId}/decision`, {
                method: "POST",
                cookie: admin,
                body: { decision: "APPROVE" },
              })
            ).response.status,
            200,
          );
        },
      );

      await t.test(
        "register/login reject passwords over 72 UTF-8 bytes and accept the boundary",
        async () => {
          const ip = "203.0.113.20";
          for (const value of ["a".repeat(73), "\u00e1".repeat(37)]) {
            assert.equal(
              (
                await request("/auth/register", {
                  method: "POST",
                  ip,
                  body: {
                    email: `${randomUUID()}@security.test`,
                    password: value,
                    displayName: "Password test",
                  },
                })
              ).response.status,
              422,
            );
            assert.equal(
              (
                await request("/auth/login", {
                  method: "POST",
                  ip,
                  body: { email: users.seller.email, password: value },
                })
              ).response.status,
              422,
            );
          }
          const email = "boundary@security.test";
          const boundary = "a".repeat(72);
          assert.equal(
            (
              await request("/auth/register", {
                method: "POST",
                ip,
                body: {
                  email,
                  password: boundary,
                  displayName: "Boundary test",
                },
              })
            ).response.status,
            201,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                ip,
                body: { email, password: boundary },
              })
            ).response.status,
            200,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                ip,
                body: { email, password: boundary + "different-tail" },
              })
            ).response.status,
            422,
          );
        },
      );

      function digest(code) {
        return createHmac("sha256", process.env.SESSION_SECRET)
          .update(`${users.otp._id}:${code}`)
          .digest("hex");
      }
      const otp = await login(users.otp, "203.0.113.30");
      await t.test(
        "eight simultaneous wrong codes consume exactly five attempts",
        async () => {
          await User.updateOne(
            { _id: users.otp._id },
            {
              $set: {
                verificationHash: digest("123456"),
                verificationExpiresAt: new Date(Date.now() + 600000),
                verificationAttempts: 0,
              },
            },
          );
          const responses = await Promise.all(
            Array.from({ length: 8 }, () =>
              request("/auth/verify-email", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.31",
                body: { code: "000000" },
              }),
            ),
          );
          assert.equal(
            responses.filter((result) => result.response.status === 400).length,
            5,
          );
          assert.equal(
            responses.filter((result) => result.response.status === 429).length,
            3,
          );
          assert.equal(
            (await User.findById(users.otp._id)).verificationAttempts,
            5,
          );
          assert.equal(
            (
              await request("/auth/verify-email", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.32",
                body: { code: "123456" },
              })
            ).response.status,
            429,
          );
        },
      );

      await t.test(
        "concurrent resend sends once and invalidates the old token",
        async () => {
          await User.updateOne(
            { _id: users.otp._id },
            {
              $set: {
                verificationHash: digest("123456"),
                verificationAttempts: 0,
                verificationExpiresAt: new Date(Date.now() + 600000),
                verificationSentAt: new Date(Date.now() - 120000),
                verificationWindowStart: new Date(),
                verificationSendsInWindow: 1,
              },
            },
          );
          const before = mails.length;
          const responses = await Promise.all(
            Array.from({ length: 8 }, () =>
              request("/auth/resend-verification", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.40",
                body: {},
              }),
            ),
          );
          assert.ok(
            responses.every((result) => result.response.status === 200),
          );
          assert.equal(mails.length - before, 1);
          assert.equal(
            (await User.findById(users.otp._id)).verificationSendsInWindow,
            2,
          );
          assert.equal(
            (
              await request("/auth/verify-email", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.41",
                body: { code: "123456" },
              })
            ).response.status,
            400,
          );
          const code = mails.at(-1).text.match(/\b\d{6}\b/)[0];
          const verified = await Promise.all(
            [1, 2].map(() =>
              request("/auth/verify-email", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.42",
                body: { code },
              }),
            ),
          );
          assert.ok(verified.every((result) => result.response.status === 200));
          assert.ok((await User.findById(users.otp._id)).emailVerifiedAt);
          assert.equal(
            (
              await request("/auth/logout", {
                method: "POST",
                cookie: otp,
                ip: "203.0.113.43",
                body: {},
              })
            ).response.status,
            200,
          );
          assert.equal(
            (await request("/me", { cookie: otp })).response.status,
            401,
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (store) await store.close();
      MongoStore.create = originalCreateStore;
      if (mongoose.connection.readyState === 1) {
        for (const collection of [
          "users",
          "listings",
          "media",
          "auditevents",
          "notifications",
          "sessions",
        ]) {
          await mongoose.connection.db.collection(collection).deleteMany({});
        }
      }
      for (const filename of filenames)
        await fs.rm(path.join(uploadDir, filename), { force: true });
      await mongoose.disconnect();
    }
  },
);
