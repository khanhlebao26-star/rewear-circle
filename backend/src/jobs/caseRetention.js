const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const AuditEvent = require("../models/AuditEvent");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const Notification = require("../models/Notification");
const Order = require("../models/commerce").Order;
const Report = require("../models/Report");

const BATCH_SIZE = 100;
const REDACTED_TEXT = "Nội dung đã được lưu trữ theo chính sách lưu giữ.";
const DEFAULT_UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

function subtractUtcMonths(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function eligibleCases(cutoff) {
  return { status: "CLOSED", closedAt: { $lte: cutoff }, contentRedacted: { $ne: true } };
}

async function evidenceIdsForCase(caseRecord, session) {
  const [reports, complaints, pendingMedia] = await Promise.all([
    Report.find({ caseId: caseRecord._id }).select("evidenceMediaIds").session(session).lean(),
    Complaint.find({ caseId: caseRecord._id }).select("evidenceMediaIds").session(session).lean(),
    Media.find({ caseId: caseRecord._id, purpose: "RETENTION_PENDING" }).select("_id").session(session).lean(),
  ]);
  return [...new Set([
    ...(caseRecord.evidenceMediaIds || []).map(String),
    ...reports.flatMap((record) => record.evidenceMediaIds.map(String)),
    ...complaints.flatMap((record) => record.evidenceMediaIds.map(String)),
    ...pendingMedia.map((record) => String(record._id)),
  ])].map((id) => new mongoose.Types.ObjectId(id));
}

async function hasExternalReference(mediaId, caseId, session) {
  const refs = await Promise.all([
    Listing.exists({ "versions.imageIds": mediaId }).session(session),
    Order.exists({ "items.imageIds": mediaId }).session(session),
    Case.exists({ _id: { $ne: caseId }, evidenceMediaIds: mediaId }).session(session),
    Complaint.exists({ caseId: { $ne: caseId }, evidenceMediaIds: mediaId }).session(session),
    Report.exists({ caseId: { $ne: caseId }, evidenceMediaIds: mediaId }).session(session),
  ]);
  return refs.some(Boolean);
}

async function markCaseForRetention(caseId, cutoff, now, runId) {
  return mongoose.connection.transaction(async (session) => {
    const caseRecord = await Case.findOne({ _id: caseId, ...eligibleCases(cutoff) }).session(session);
    if (!caseRecord) return { redacted: false, mediaIds: [] };
    const wasRedacted = caseRecord.contentRedacted;

    const mediaIds = await evidenceIdsForCase(caseRecord, session);
    for (const mediaId of mediaIds) {
      const media = await Media.findOne({ _id: mediaId, purpose: "CASE_EVIDENCE" }).session(session);
      if (!media || (media.caseId && String(media.caseId) !== String(caseId))) continue;
      if (await hasExternalReference(mediaId, caseId, session)) continue;
      await Media.updateOne(
        { _id: mediaId, purpose: "CASE_EVIDENCE", $or: [{ caseId: null }, { caseId }] },
        { $set: { purpose: "RETENTION_PENDING", caseId } },
        { session },
      );
    }

    if (!caseRecord.contentRedacted) {
      await Complaint.collection.updateMany(
        { caseId: caseRecord._id },
        { $set: {
          details: REDACTED_TEXT,
          affectedOrderItemIds: [],
          itemSnapshots: [],
          evidenceMediaIds: [],
          contentRedacted: true,
          contentRedactedAt: now,
        } },
        { session },
      );
      await Report.collection.updateMany(
        { caseId: caseRecord._id },
        { $set: {
          details: REDACTED_TEXT,
          evidenceMediaIds: [],
          contentRedacted: true,
          contentRedactedAt: now,
        } },
        { session },
      );
      await AuditEvent.updateMany(
        {
          action: { $in: [
            "REPORT_CREATED",
            "COMPLAINT_CREATED",
            "CASE_REVIEW_STARTED",
            "CASE_ASSIGNED",
            "CASE_CLOSED",
            "CASE_DETAIL_READ",
            "CASE_EVIDENCE_READ",
            "CASE_SNAPSHOT_MEDIA_READ",
            "CASE_CONTACT_ACCESS_READ",
            "MEDIA_PRIVATE_READ",
          ] },
          $or: [{ caseId: caseRecord._id }, { targetType: "CASE", targetId: caseRecord._id }],
        },
        { $set: { reason: "" } },
        { session },
      );
      await Notification.updateMany(
        { caseId: caseRecord._id },
        { $set: { message: REDACTED_TEXT, reason: "" } },
        { session },
      );

      caseRecord.contentRedacted = true;
      caseRecord.contentRedactedAt = now;
      caseRecord.evidenceMediaIds = [];
      caseRecord.outcomeSummary = REDACTED_TEXT;
      caseRecord.decisions = caseRecord.decisions.map((decision) => ({
        ...decision.toObject(),
        outcomeSummary: REDACTED_TEXT,
        internalNote: "",
      }));
      await caseRecord.save({ session });

      if (!await AuditEvent.exists({ caseId: caseRecord._id, action: "CASE_RETENTION_APPLIED" }).session(session)) {
        await AuditEvent.create([{
          actorType: "SYSTEM",
          action: "CASE_RETENTION_APPLIED",
          targetType: "CASE",
          targetId: caseRecord._id,
          caseId: caseRecord._id,
          requestId: runId,
          reason: "CASE_CONTENT_REDACTED",
          fromState: "CLOSED",
          toState: "CONTENT_REDACTED",
        }], { session });
      }
    }
    return { redacted: !wasRedacted, mediaIds };
  });
}

async function deletePendingMedia({ caseIds, uploadDir }) {
  const filter = { purpose: "RETENTION_PENDING", ...(caseIds ? { caseId: { $in: caseIds } } : {}) };
  const pending = await Media.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE).select("_id caseId filename").lean();
  let deleted = 0;
  let deferred = 0;
  let errors = 0;
  for (const media of pending) {
    const caseRecord = await Case.findOne({ _id: media.caseId, status: "CLOSED", contentRedacted: true });
    if (!caseRecord || await hasExternalReference(media._id, media.caseId)) {
      deferred += 1;
      continue;
    }
    if (typeof media.filename !== "string" || path.basename(media.filename) !== media.filename) {
      errors += 1;
      continue;
    }
    try {
      await fs.rm(path.join(uploadDir, media.filename), { force: true });
      await Media.deleteOne({ _id: media._id, purpose: "RETENTION_PENDING", caseId: media.caseId });
      deleted += 1;
    } catch {
      errors += 1;
    }
  }
  return { deleted, deferred, errors };
}

async function runCaseRetention({ now = new Date(), dryRun = true, uploadDir = DEFAULT_UPLOAD_DIR } = {}) {
  const cutoff = subtractUtcMonths(now, 12);
  const filter = eligibleCases(cutoff);
  const eligibleCaseCount = await Case.countDocuments(filter);
  const cases = await Case.find(filter).sort({ closedAt: 1, _id: 1 }).limit(BATCH_SIZE).select("_id closedAt evidenceMediaIds").lean();
  const caseIds = cases.map((record) => record._id);
  const [reports, complaints, pendingMedia] = caseIds.length
    ? await Promise.all([
        Report.find({ caseId: { $in: caseIds } }).select("caseId evidenceMediaIds").lean(),
        Complaint.find({ caseId: { $in: caseIds } }).select("caseId evidenceMediaIds").lean(),
        Media.find({ purpose: "RETENTION_PENDING" }).select("_id caseId filename").limit(BATCH_SIZE).lean(),
      ])
    : [[], [], await Media.find({ purpose: "RETENTION_PENDING" }).select("_id caseId filename").limit(BATCH_SIZE).lean()];
  const mediaCaseById = new Map();
  for (const record of cases) for (const id of record.evidenceMediaIds || []) mediaCaseById.set(String(id), record._id);
  for (const record of [...reports, ...complaints]) {
    for (const id of record.evidenceMediaIds) mediaCaseById.set(String(id), record.caseId);
  }
  for (const record of pendingMedia) mediaCaseById.set(String(record._id), record.caseId);
  const mediaIdSet = new Set(mediaCaseById.keys());
  const candidateMedia = mediaIdSet.size
    ? await Media.find({ _id: { $in: [...mediaIdSet] }, purpose: { $in: ["CASE_EVIDENCE", "RETENTION_PENDING"] } }).select("_id caseId").lean()
    : [];
  let sharedMediaRetained = 0;
  let mediaCleanupCandidates = 0;
  for (const media of candidateMedia) {
    const caseId = media.caseId || mediaCaseById.get(String(media._id));
    if (!caseId || await hasExternalReference(media._id, caseId)) sharedMediaRetained += 1;
    else mediaCleanupCandidates += 1;
  }

  if (dryRun) {
    return {
      mode: "DRY_RUN",
      cutoff: cutoff.toISOString(),
      batchSize: BATCH_SIZE,
      eligibleCaseCount,
      casesInBatch: cases.length,
      reportsToRedact: reports.length,
      complaintsToRedact: complaints.length,
      mediaCleanupCandidates,
      sharedMediaRetained,
      writesPerformed: 0,
    };
  }

  const runId = randomUUID();
  let casesRedacted = 0;
  for (const record of cases) {
    const result = await markCaseForRetention(record._id, cutoff, now, runId);
    if (result.redacted) casesRedacted += 1;
  }
  const cleanup = await deletePendingMedia({ uploadDir });
  const [remainingCases, pendingMediaRemaining] = await Promise.all([
    Case.countDocuments(filter),
    Media.countDocuments({ purpose: "RETENTION_PENDING" }),
  ]);
  return {
    mode: "APPLIED",
    cutoff: cutoff.toISOString(),
    runId,
    casesRedacted,
    ...cleanup,
    eligibleCasesRemaining: remainingCases,
    pendingMediaRemaining,
  };
}

module.exports = { BATCH_SIZE, REDACTED_TEXT, runCaseRetention, subtractUtcMonths };
