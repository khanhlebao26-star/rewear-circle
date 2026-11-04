const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");

async function main() {
  const phase = process.argv[2];
  assert.ok(["apply", "verify-restored"].includes(phase));
  assert.equal(process.env.NODE_ENV, "test");
  const uri = new URL(process.env.MONGODB_URI);
  assert.equal(uri.pathname, "/rewear_ops_acceptance_test");
  assert.equal(uri.hostname, phase === "apply" ? "mongo" : "mongo-restore");
  await mongoose.connect(process.env.MONGODB_URI);
  const Case = require("../src/models/Case");
  const Report = require("../src/models/Report");
  const Complaint = require("../src/models/Complaint");
  const Media = require("../src/models/Media");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const Listing = require("../src/models/Listing");
  const { Order } = require("../src/models/commerce");
  const markerPath = "/backups/acceptance-run.json";
  if (phase === "verify-restored") {
    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    const old = await Case.findById(marker.oldCaseId);
    assert.ok(old);
    assert.equal(old.contentRedacted, false);
    assert.equal(
      (await Report.findOne({ caseId: old._id })).details,
      marker.originalDetails,
    );
    assert.equal(await Case.countDocuments({}), 3);
    assert.equal(await Media.countDocuments({}), 2);
    assert.equal(
      await fs.readFile(path.join("/app/uploads", marker.privateFile), "utf8"),
      "private test evidence",
    );
    assert.equal(
      await fs.readFile(path.join("/app/uploads", marker.sharedFile), "utf8"),
      "shared test evidence",
    );
    console.log(
      JSON.stringify({
        event: "isolated_restore_acceptance",
        status: "PASS",
        cases: 3,
        media: 2,
      }),
    );
    return;
  }
  const models = [
    Case,
    Report,
    Complaint,
    Media,
    AuditEvent,
    Notification,
    Listing,
    Order,
  ];
  await Promise.all(models.map((Model) => Model.init()));
  for (const collection of await mongoose.connection.db
    .listCollections()
    .toArray()) {
    assert.equal(
      await mongoose.connection.db
        .collection(collection.name)
        .countDocuments({}),
      0,
      "Use a fresh isolated verification project; acceptance data must start empty.",
    );
  }
  const now = new Date();
  const oldDate = new Date(now);
  oldDate.setUTCMonth(oldDate.getUTCMonth() - 13);
  const reporterId = new mongoose.Types.ObjectId();
  const old = await Case.create({
    type: "REPORT",
    targetType: "LISTING",
    targetId: new mongoose.Types.ObjectId(),
    status: "CLOSED",
    closedAt: oldDate,
    outcomeCode: "NO_ACTION",
    outcomeSummary: "Original test summary.",
  });
  const active = await Case.create({
    type: "REPORT",
    targetType: "LISTING",
    targetId: new mongoose.Types.ObjectId(),
  });
  const recent = await Case.create({
    type: "REPORT",
    targetType: "LISTING",
    targetId: new mongoose.Types.ObjectId(),
    status: "CLOSED",
    closedAt: now,
    outcomeCode: "NO_ACTION",
    outcomeSummary: "Recent test summary.",
  });
  const privateFile = "acceptance-private.png";
  const sharedFile = "acceptance-shared.png";
  await fs.mkdir("/app/uploads", { recursive: true });
  await fs.writeFile(
    path.join("/app/uploads", privateFile),
    "private test evidence",
  );
  await fs.writeFile(
    path.join("/app/uploads", sharedFile),
    "shared test evidence",
  );
  const [privateMedia, sharedMedia] = await Media.create([
    {
      ownerId: reporterId,
      filename: privateFile,
      mimeType: "image/png",
      size: 21,
      purpose: "CASE_EVIDENCE",
      caseId: old._id,
    },
    {
      ownerId: reporterId,
      filename: sharedFile,
      mimeType: "image/png",
      size: 20,
      purpose: "CASE_EVIDENCE",
      caseId: old._id,
    },
  ]);
  old.evidenceMediaIds = [privateMedia._id, sharedMedia._id];
  active.evidenceMediaIds = [sharedMedia._id];
  await old.save();
  await active.save();
  const originalDetails = "Original synthetic report details before retention.";
  await Report.create({
    caseId: old._id,
    listingId: old.targetId,
    reporterId,
    reasonCode: "OTHER",
    details: originalDetails,
    evidenceMediaIds: [privateMedia._id, sharedMedia._id],
  });

  const { runCycle } = require("../src/scripts/runOperations");
  const result = await runCycle({ apply: true, backupRoot: "/backups" });
  assert.equal(result.casesRedacted, 1);
  assert.equal(result.deleted, 1);
  assert.equal((await Case.findById(old._id)).contentRedacted, true);
  assert.equal((await Case.findById(active._id)).contentRedacted, false);
  assert.equal((await Case.findById(recent._id)).contentRedacted, false);
  await assert.rejects(fs.stat(path.join("/app/uploads", privateFile)), {
    code: "ENOENT",
  });
  assert.equal(
    await fs.readFile(path.join("/app/uploads", sharedFile), "utf8"),
    "shared test evidence",
  );
  const replay = await runCycle({ apply: true, backupRoot: "/backups" });
  assert.equal(replay.writesPerformed, 0);
  assert.equal(
    await AuditEvent.countDocuments({
      action: "CASE_RETENTION_APPLIED",
      caseId: old._id,
    }),
    1,
  );
  const root = path.join("/backups", result.runId);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const directory = entries.find((entry) => entry.isDirectory());
  assert.ok(directory);
  const archive = path.join(root, directory.name, "mongo-full.archive.gz");
  await fs.writeFile(
    markerPath,
    JSON.stringify({
      archive,
      oldCaseId: String(old._id),
      originalDetails,
      privateFile,
      sharedFile,
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: "isolated_retention_acceptance",
      status: "PASS",
      casesRedacted: 1,
      deleted: 1,
      replayWrites: 0,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "operations_acceptance_failed",
        errorType: error.name || "Error",
        errorCode: /^[A-Z0-9_]{1,64}$/.test(error.code || "")
          ? error.code
          : "OPERATIONS_ACCEPTANCE_FAILED",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
