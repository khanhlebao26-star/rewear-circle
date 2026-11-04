const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { REDACTED_TEXT, runCaseRetention } = require("../src/jobs/caseRetention");

const mongoUri = process.env.MONGODB_TEST_URI;

async function withRetentionData(work) {
  assert.match(new URL(mongoUri).pathname, /_test$/);
  const mongoose = require("mongoose");
  const Case = require("../src/models/Case");
  const Media = require("../src/models/Media");
  const Report = require("../src/models/Report");
  const Complaint = require("../src/models/Complaint");
  const Listing = require("../src/models/Listing");
  const { Order } = require("../src/models/commerce");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const models = [Case, Media, Report, Complaint, Listing, Order, AuditEvent, Notification];
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "rewear-retention-test-"));
  await mongoose.connect(mongoUri);
  try {
    await Promise.all(models.map(Model => Model.deleteMany({})));
    await Promise.all(models.map(Model => Model.init()));
    await work({ mongoose, Case, Media, Report, Complaint, Listing, Order, AuditEvent, uploadDir });
  } finally {
    await Promise.all(models.map(Model => Model.deleteMany({})));
    await mongoose.disconnect();
    assert.equal(path.dirname(uploadDir), os.tmpdir());
    assert.match(path.basename(uploadDir), /^rewear-retention-test-/);
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
}

test("shared evidence is reclaimed after the last Case expires, including a media-only retry", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated replica set _test database",
}, async () => {
  for (const alreadyRedacted of [false, true]) {
    await withRetentionData(async ({ mongoose, Case, Media, AuditEvent, uploadDir }) => {
      const now = new Date("2026-11-04T00:00:00Z");
      const a = await Case.create({
        type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
        status: "CLOSED", closedAt: new Date("2025-10-01T00:00:00Z"),
        outcomeCode: "NO_ACTION", outcomeSummary: "Closed Case A.",
      });
      const b = await Case.create({
        type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
      });
      const media = await Media.create({
        ownerId: new mongoose.Types.ObjectId(), filename: "shared.png", mimeType: "image/png", size: 7,
        purpose: "CASE_EVIDENCE", caseId: a._id,
      });
      await fs.writeFile(path.join(uploadDir, media.filename), "fixture");
      for (const record of [a, b]) {
        record.evidenceMediaIds = [media._id];
        await record.save();
      }
      const first = await runCaseRetention({ now, dryRun: false, uploadDir });
      assert.equal(first.casesRedacted, 1);
      assert.equal(first.deleted, 0);
      assert.equal((await Media.findById(media._id)).purpose, "CASE_EVIDENCE");
      assert.equal(await fs.readFile(path.join(uploadDir, media.filename), "utf8"), "fixture");

      b.status = "CLOSED";
      b.closedAt = now;
      b.outcomeCode = "NO_ACTION";
      b.outcomeSummary = "Closed Case B.";
      await b.save();
      const recent = await runCaseRetention({ now, dryRun: false, uploadDir });
      assert.equal(recent.deleted, 0);

      // Cover both normal expiry and backlog left by the old job.
      if (alreadyRedacted) {
        b.contentRedacted = true;
        b.evidenceMediaIds = [];
        await b.save();
      }
      const later = new Date("2027-12-05T00:00:00Z");
      const preview = await runCaseRetention({ now: later, dryRun: true, uploadDir });
      assert.equal(preview.eligibleCaseCount, alreadyRedacted ? 0 : 1);
      assert.equal(preview.mediaCleanupCandidates, alreadyRedacted ? 1 : 0);
      assert.equal(preview.writesPerformed, 0);
      assert.equal((await Media.findById(media._id)).purpose, "CASE_EVIDENCE");

      const cleaned = await runCaseRetention({ now: later, dryRun: false, uploadDir });
      assert.equal(cleaned.casesRedacted, alreadyRedacted ? 0 : 1);
      assert.equal(cleaned.deleted, 1);
      assert.equal(cleaned.eligibleMediaRemaining, 0);
      assert.equal(await Media.findById(media._id), null);
      await assert.rejects(fs.stat(path.join(uploadDir, media.filename)), { code: "ENOENT" });
      const repeat = await runCaseRetention({ now: later, dryRun: false, uploadDir });
      assert.equal(repeat.deleted, 0);
      assert.equal(await AuditEvent.countDocuments({ caseId: a._id, action: "CASE_RETENTION_APPLIED" }), 1);
    });
  }
});

test("reclaimed evidence drains bounded batches without starving behind retained files", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated replica set _test database",
}, async () => withRetentionData(async ({ mongoose, Case, Media, Report, Complaint, Listing, Order, uploadDir }) => {
  const now = new Date("2026-11-04T00:00:00Z");
  const retired = await Case.create({
    type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
    status: "CLOSED", closedAt: new Date("2025-01-01T00:00:00Z"), contentRedacted: true,
    outcomeCode: "NO_ACTION", outcomeSummary: REDACTED_TEXT,
  });
  const active = await Case.create({
    type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
  });
  const recent = await Case.create({
    type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
    status: "CLOSED", closedAt: new Date("2026-10-01T00:00:00Z"), contentRedacted: true,
    outcomeCode: "NO_ACTION", outcomeSummary: REDACTED_TEXT,
  });
  const docs = await Media.insertMany(Array.from({ length: 209 }, (_, index) => ({
    ownerId: new mongoose.Types.ObjectId(), filename: `batch-${index}.png`, mimeType: "image/png", size: 7,
    purpose: "CASE_EVIDENCE", caseId: retired._id,
  })));
  await Promise.all(docs.map(media => fs.writeFile(path.join(uploadDir, media.filename), "fixture")));
  // The first 101 images are held by an active Case; the following 101 are free.
  active.evidenceMediaIds = docs.slice(0, 101).map(media => media._id);
  await active.save();
  // Protect references from every supported collection, including financial snapshots.
  await Report.collection.insertOne({ caseId: active._id, evidenceMediaIds: [docs[202]._id] });
  await Complaint.collection.insertOne({ caseId: active._id, evidenceMediaIds: [docs[203]._id] });
  await Listing.collection.insertOne({ versions: [{ imageIds: [docs[204]._id] }] });
  await Order.collection.insertOne({ items: [{ imageIds: [docs[205]._id] }] });
  await Media.updateOne({ _id: docs[206]._id }, { $set: { caseId: active._id } });
  await Media.updateOne({ _id: docs[207]._id }, { $set: { caseId: recent._id } });
  await Media.updateOne({ _id: docs[208]._id }, { $set: { caseId: null } });

  const preview = await runCaseRetention({ now, dryRun: true, uploadDir });
  assert.equal(preview.eligibleCaseCount, 0);
  assert.equal(preview.mediaCleanupCandidates, 100);
  assert.equal(await Media.countDocuments({ purpose: "RETENTION_PENDING" }), 0);
  const first = await runCaseRetention({ now, dryRun: false, uploadDir });
  assert.equal(first.deleted, 100);
  assert.equal(first.eligibleMediaRemaining, 1);
  assert.equal(first.pendingMediaRemaining, 0);
  const second = await runCaseRetention({ now, dryRun: false, uploadDir });
  assert.equal(second.deleted, 1);
  assert.equal(second.eligibleMediaRemaining, 0);
  const kept = [...docs.slice(0, 101), ...docs.slice(202)];
  assert.equal(await Media.countDocuments({}), kept.length);
  for (const media of kept) {
    assert.equal((await Media.findById(media._id)).purpose, "CASE_EVIDENCE");
    assert.equal(await fs.readFile(path.join(uploadDir, media.filename), "utf8"), "fixture");
  }
  assert.equal(await Listing.countDocuments({}), 1);
  assert.equal(await Order.countDocuments({}), 1);
  assert.equal((await runCaseRetention({ now, dryRun: false, uploadDir })).deleted, 0);
}));

test("case retention dry-run is inert and apply redacts old closed cases safely", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database ending in _test",
}, async () => {
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  const mongoose = require("mongoose");
  const Case = require("../src/models/Case");
  const Report = require("../src/models/Report");
  const Complaint = require("../src/models/Complaint");
  const Media = require("../src/models/Media");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const Listing = require("../src/models/Listing");
  const { Order } = require("../src/models/commerce");
  const models = [Case, Report, Complaint, Media, AuditEvent, Notification, Listing, Order];
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "rewear-retention-test-"));
  const oldFile = `old-${randomUUID()}.png`;
  const complaintFile = `complaint-${randomUUID()}.png`;
  const sharedFile = `shared-${randomUUID()}.png`;
  const now = new Date("2026-10-31T00:00:00.000Z");
  await mongoose.connect(mongoUri);

  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));
    await fs.writeFile(path.join(uploadDir, oldFile), "old evidence");
    await fs.writeFile(path.join(uploadDir, complaintFile), "old complaint evidence");
    await fs.writeFile(path.join(uploadDir, sharedFile), "shared evidence");

    const listingId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const oldCase = await Case.create({
      type: "REPORT", targetType: "LISTING", targetId: listingId,
      status: "CLOSED", outcomeCode: "CORRECTION_REQUIRED", outcomeSummary: "Summary with private details.",
      closedAt: new Date("2025-09-30T00:00:00.000Z"),
    });
    const oldOrderCase = await Case.create({
      type: "ITEM", targetType: "ORDER", targetId: new mongoose.Types.ObjectId(),
      status: "CLOSED", outcomeCode: "RESOLVED", outcomeSummary: "Order case private summary.",
      closedAt: new Date("2025-09-30T00:00:00.000Z"),
    });
    const openCase = await Case.create({ type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId() });
    const recentCase = await Case.create({
      type: "REPORT", targetType: "LISTING", targetId: new mongoose.Types.ObjectId(),
      status: "CLOSED", outcomeCode: "CORRECTION_REQUIRED", outcomeSummary: "Recent case.",
      closedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    const [oldMedia, complaintMedia, sharedMedia] = await Media.create([
      { ownerId: reporterId, filename: oldFile, mimeType: "image/png", size: 12, purpose: "CASE_EVIDENCE", caseId: oldCase._id },
      { ownerId: reporterId, filename: complaintFile, mimeType: "image/png", size: 20, purpose: "CASE_EVIDENCE", caseId: oldOrderCase._id },
      { ownerId: reporterId, filename: sharedFile, mimeType: "image/png", size: 12, purpose: "CASE_EVIDENCE", caseId: oldCase._id },
    ]);
    oldCase.evidenceMediaIds = [oldMedia._id, sharedMedia._id];
    await oldCase.save();
    oldOrderCase.evidenceMediaIds = [complaintMedia._id];
    await oldOrderCase.save();
    openCase.evidenceMediaIds = [sharedMedia._id];
    await openCase.save();
    const report = await Report.create({
      caseId: oldCase._id,
      listingId,
      reporterId,
      reasonCode: "OTHER",
      details: "Reporter supplied private investigation details.",
      evidenceMediaIds: [oldMedia._id, sharedMedia._id],
    });
    const complaintId = new mongoose.Types.ObjectId();
    const complaintBuyerId = new mongoose.Types.ObjectId();
    await Complaint.collection.insertOne({
      _id: complaintId,
      caseId: oldOrderCase._id,
      orderId: oldOrderCase.targetId,
      checkoutId: new mongoose.Types.ObjectId(),
      buyerId: complaintBuyerId,
      sellerId: reporterId,
      type: "ITEM",
      reasonCode: "NOT_AS_DESCRIBED",
      details: "Complaint details that contain private information.",
      affectedOrderItemIds: [new mongoose.Types.ObjectId()],
      itemSnapshots: [{ orderItemId: new mongoose.Types.ObjectId(), title: "Private item snapshot", imageIds: [complaintMedia._id] }],
      orderStatusAtSubmission: "COMPLETED",
      paymentMethod: "COD",
      paymentStatusAtSubmission: "COLLECTED",
      evidenceMediaIds: [complaintMedia._id],
      idempotencyKey: "retention-test-key",
      idempotencyFingerprint: "a".repeat(64),
      createdAt: now,
      updatedAt: now,
    });
    await AuditEvent.create({
      actorType: "SYSTEM", action: "REPORT_CREATED", targetType: "REPORT", targetId: report._id,
      requestId: "retention-test", caseId: oldCase._id, reason: "Private contact details to remove.",
    });
    await Notification.create({
      recipientId: reporterId, type: "REPORT_RECEIVED", listingId, reportId: report._id, caseId: oldCase._id,
      message: "Notification with private details.",
    });

    const preview = await runCaseRetention({ now, dryRun: true, uploadDir });
    assert.equal(preview.eligibleCaseCount, 2);
    assert.equal(preview.reportsToRedact, 1);
    assert.equal(preview.complaintsToRedact, 1);
    assert.equal(preview.mediaCleanupCandidates, 2);
    assert.equal(preview.sharedMediaRetained, 1);
    assert.equal(preview.writesPerformed, 0);
    assert.equal(await fs.readFile(path.join(uploadDir, oldFile), "utf8"), "old evidence");

    const applied = await runCaseRetention({ now, dryRun: false, uploadDir });
    assert.equal(applied.casesRedacted, 2);
    assert.equal(applied.deleted, 2);
    assert.equal(applied.deferred, 0);
    assert.equal(applied.errors, 0);
    assert.equal(await fs.stat(path.join(uploadDir, oldFile)).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(uploadDir, complaintFile)).then(() => true, () => false), false);
    assert.equal(await fs.readFile(path.join(uploadDir, sharedFile), "utf8"), "shared evidence");

    const [storedCase, storedOrderCase, storedReport, storedComplaint, storedOldMedia, storedComplaintMedia, storedSharedMedia, auditEvents, notification] = await Promise.all([
      Case.findById(oldCase._id).lean(),
      Case.findById(oldOrderCase._id).lean(),
      Report.findById(report._id).lean(),
      Complaint.findById(complaintId).lean(),
      Media.findById(oldMedia._id),
      Media.findById(complaintMedia._id),
      Media.findById(sharedMedia._id),
      AuditEvent.find({ caseId: oldCase._id }).lean(),
      Notification.findOne({ caseId: oldCase._id }).lean(),
    ]);
    assert.equal(storedCase.contentRedacted, true);
    assert.equal(storedCase.outcomeSummary, REDACTED_TEXT);
    assert.deepEqual(storedCase.evidenceMediaIds, []);
    assert.equal(storedReport.contentRedacted, true);
    assert.equal(storedReport.details, REDACTED_TEXT);
    assert.deepEqual(storedReport.evidenceMediaIds, []);
    assert.equal(storedOrderCase.contentRedacted, true);
    assert.equal(storedComplaint.contentRedacted, true);
    assert.equal(storedComplaint.details, REDACTED_TEXT);
    assert.deepEqual(storedComplaint.affectedOrderItemIds, []);
    assert.deepEqual(storedComplaint.itemSnapshots, []);
    assert.deepEqual(storedComplaint.evidenceMediaIds, []);
    assert.equal(storedOldMedia, null);
    assert.equal(storedComplaintMedia, null);
    assert.equal(storedSharedMedia.purpose, "CASE_EVIDENCE");
    assert.equal(auditEvents.some((event) => event.action === "CASE_RETENTION_APPLIED"), true);
    assert.equal(auditEvents.some((event) => event.reason.includes("Private")), false);
    assert.equal(notification.message, REDACTED_TEXT);
    await assert.rejects(
      require("../src/services/complaints").getBuyerComplaint({
        orderId: oldOrderCase.targetId,
        complaintId,
        buyerId: complaintBuyerId,
      }),
      (error) => error.status === 410 && error.code === "CONTENT_REDACTED",
    );
    assert.equal((await Case.findById(openCase._id)).status, "OPEN");
    assert.equal((await Case.findById(recentCase._id)).contentRedacted, false);

    const replay = await runCaseRetention({ now, dryRun: false, uploadDir });
    assert.equal(replay.casesRedacted, 0);
    assert.equal(await AuditEvent.countDocuments({ caseId: oldCase._id, action: "CASE_RETENTION_APPLIED" }), 1);
  } finally {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
});
