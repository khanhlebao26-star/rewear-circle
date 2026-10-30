const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { REDACTED_TEXT, runCaseRetention } = require("../src/jobs/caseRetention");

const mongoUri = process.env.MONGODB_TEST_URI;

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
