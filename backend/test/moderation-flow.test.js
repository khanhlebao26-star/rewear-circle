const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const mongoUri = process.env.MONGODB_TEST_URI;

test("listing reports group into a Case and close atomically notifies reporters", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated replica-set database ending in _test",
}, async () => {
  const { URL } = require("node:url");
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  const mongoose = require("mongoose");
  const express = require("express");
  const User = require("../src/models/User");
  const Listing = require("../src/models/Listing");
  const Media = require("../src/models/Media");
  const Report = require("../src/models/Report");
  const Case = require("../src/models/Case");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const models = [User, Listing, Media, Report, Case, AuditEvent, Notification];
  let server;

  await mongoose.connect(mongoUri);
  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));

    const [seller, reporter, secondReporter, admin] = await User.create([
      { email: "seller@moderation.test", passwordHash: "hash", displayName: "Seller", emailVerifiedAt: new Date() },
      { email: "reporter@moderation.test", passwordHash: "hash", displayName: "Reporter", emailVerifiedAt: new Date() },
      { email: "reporter2@moderation.test", passwordHash: "hash", displayName: "Reporter Two", emailVerifiedAt: new Date() },
      { email: "admin@moderation.test", passwordHash: "hash", displayName: "Admin", role: "ADMIN", emailVerifiedAt: new Date() },
    ]);
    const evidence = await Media.create({
      ownerId: reporter._id,
      filename: "unused-evidence.png",
      mimeType: "image/png",
      size: 8,
      purpose: "CASE_EVIDENCE",
    });
    const listing = new Listing({
      ownerId: seller._id,
      versions: [{
        title: "Áo sơ mi cần kiểm tra",
        category: "Áo",
        size: "M",
        condition: "Còn tốt",
        description: "Áo sạch, không rách, phù hợp để dùng hằng ngày.",
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

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = randomUUID();
      req.session = { userId: req.get("x-test-user-id") };
      next();
    });
    app.use("/api/v1", require("../src/routes/listings"));
    app.use("/api/v1", require("../src/routes/moderation"));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      res.status(error.status || 500).json({ error: { code: error.code || "INTERNAL_ERROR" } });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    async function request(path, { user, method = "GET", body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(user ? { "x-test-user-id": String(user._id) } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { response, data: await response.json() };
    }

    const ownReport = await request("/reports/listings", {
      user: seller,
      method: "POST",
      body: { listingId: String(listing._id), reasonCode: "SUSPECTED_SCAM" },
    });
    assert.equal(ownReport.response.status, 403);

    const first = await request("/reports/listings", {
      user: reporter,
      method: "POST",
      body: {
        listingId: String(listing._id),
        reasonCode: "SUSPECTED_COUNTERFEIT",
        details: "Hình ảnh có dấu hiệu không khớp.",
        evidenceMediaIds: [String(evidence._id)],
      },
    });
    const second = await request("/reports/listings", {
      user: secondReporter,
      method: "POST",
      body: { listingId: String(listing._id), reasonCode: "SUSPECTED_SCAM" },
    });
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 201);
    assert.equal(first.data.data.caseId, second.data.data.caseId);
    assert.equal(await Report.countDocuments({ caseId: first.data.data.caseId }), 2);

    const queue = await request("/admin/cases?type=REPORT&status=OPEN", { user: admin });
    assert.equal(queue.response.status, 200);
    assert.equal(queue.data.data.length, 1);
    assert.equal(queue.data.data[0].reportCount, 2);

    const detail = await request(`/admin/cases/${first.data.data.caseId}`, { user: admin });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.data.data.reports.length, 2);
    assert.deepEqual(detail.data.data.reports[0].evidenceMediaIds.map(String), [String(evidence._id)]);

    const review = await request(`/admin/cases/${first.data.data.caseId}/decisions`, {
      user: admin,
      method: "POST",
      body: { status: "IN_REVIEW" },
    });
    assert.equal(review.response.status, 200);

    const closed = await request(`/admin/cases/${first.data.data.caseId}/decisions`, {
      user: admin,
      method: "POST",
      body: {
        status: "CLOSED",
        outcomeCode: "CORRECTION_REQUIRED",
        outcomeSummary: "Đã yêu cầu Seller chỉnh sửa nội dung tin.",
        internalNote: "Admin only",
      },
    });
    assert.equal(closed.response.status, 200);
    assert.equal((await Listing.findById(listing._id)).correctionRequested, true);
    assert.equal((await Case.findById(first.data.data.caseId)).status, "CLOSED");
    assert.equal(await AuditEvent.countDocuments({ caseId: first.data.data.caseId }), 5);

    const reporterNotifications = await request("/me/notifications", { user: reporter });
    const secondNotifications = await request("/me/notifications", { user: secondReporter });
    assert.equal(reporterNotifications.data.data.length, 2);
    assert.equal(secondNotifications.data.data.length, 2);
    assert.equal(reporterNotifications.data.data.some(({ type }) => type === "CASE_CLOSED"), true);
    assert.equal(reporterNotifications.data.data.some((notice) => "internalNote" in notice), false);

    const privateNotice = reporterNotifications.data.data[0];
    const wrongOwnerRead = await request(`/me/notifications/${privateNotice._id}/read`, {
      user: secondReporter,
      method: "PATCH",
    });
    assert.equal(wrongOwnerRead.response.status, 404);

    const newCaseReport = await request("/reports/listings", {
      user: reporter,
      method: "POST",
      body: { listingId: String(listing._id), reasonCode: "INACCURATE_OR_INCOMPLETE" },
    });
    assert.equal(newCaseReport.response.status, 201);
    assert.notEqual(newCaseReport.data.data.caseId, first.data.data.caseId);
    assert.equal(newCaseReport.data.data.status, "OPEN");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
