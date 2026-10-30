const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const Media = require("../models/Media");
const Listing = require("../models/Listing");
const Report = require("../models/Report");
const Case = require("../models/Case");
const Complaint = require("../models/Complaint");
const AuditEvent = require("../models/AuditEvent");
const User = require("../models/User");
const { Order } = require("../models/commerce");
const { approvedVersion, approvedVisibleListingQuery } = require("../domain/commerceRules");
const { detectImage } = require("../domain/mediaRules");
const { readCaseMedia } = require("../services/caseAccess");
const {
  requireAuth,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");

const uploadDir = path.resolve(__dirname, "../../uploads");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
});

function caseReadFilter(user) {
  if (user.role === "SUPPORT") {
    return { assignedSupportId: user._id, status: { $in: ["OPEN", "IN_REVIEW"] } };
  }
  return user.role === "ADMIN" ? {} : null;
}

router.post(
  "/media/upload-requests",
  requireAuth,
  requireVerifiedEmail,
  (req, res, next) => {
    upload.array("images", 5)(req, res, (error) => {
      if (!error) return next();
      return fail(
        req,
        res,
        error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        "INVALID_IMAGE",
        "Ảnh không hợp lệ hoặc vượt giới hạn.",
      );
    });
  },
  async (req, res, next) => {
    const writtenFiles = [];
    const createdIds = [];
    const purpose = req.body?.purpose || "LISTING";

    try {
      if (!["LISTING", "CASE_EVIDENCE"].includes(purpose)) {
        return fail(req, res, 422, "VALIDATION_ERROR", "purpose không hợp lệ.");
      }
      if (purpose === "CASE_EVIDENCE" && req.user.role !== "USER") {
        return fail(req, res, 403, "FORBIDDEN", "Chỉ tài khoản Buyer/Seller mới tải bằng chứng vụ việc.");
      }
      if (!req.files?.length) {
        return fail(req, res, 422, "VALIDATION_ERROR", "Cần ít nhất một ảnh.");
      }

      const checked = req.files.map((file) => ({
        file,
        detected: detectImage(file.buffer),
      }));

      if (
        checked.some(
          ({ file, detected }) =>
            !detected || file.mimetype !== detected.mimeType,
        )
      ) {
        return fail(
          req,
          res,
          422,
          "INVALID_IMAGE",
          "Chỉ nhận JPEG, PNG hoặc WebP hợp lệ.",
        );
      }

      await fs.mkdir(uploadDir, { recursive: true });
      const data = [];

      for (const { file, detected } of checked) {
        const filename = `${randomUUID()}${detected.extension}`;
        await fs.writeFile(path.join(uploadDir, filename), file.buffer);
        writtenFiles.push(filename);

        const media = await Media.create({
          ownerId: req.user._id,
          filename,
          mimeType: detected.mimeType,
          size: file.size,
          purpose,
        });
        createdIds.push(media._id);

        data.push({
          mediaId: String(media._id),
          purpose: media.purpose,
          url: `/api/v1/media/${media._id}`,
        });
      }

      return success(req, res, data, 201);
    } catch (error) {
      await Promise.all(
        writtenFiles.map((filename) =>
          fs
            .rm(path.join(uploadDir, filename), { force: true })
            .catch(() => {}),
        ),
      );
      if (createdIds.length) {
        await Media.deleteMany({ _id: { $in: createdIds } }).catch(() => {});
      }
      throw error;
    }
  },
);

async function findEvidenceCase(media, user) {
  const reports = await Report.find({ evidenceMediaIds: media._id }).select("caseId");
  const reportCaseIds = reports.map((report) => report.caseId);
  const allowedCaseIds = media.caseId ? [media.caseId] : reportCaseIds;
  if (!allowedCaseIds.length) return null;
  const accessFilter = caseReadFilter(user);
  if (!accessFilter) return null;

  return Case.findOne({
    ...accessFilter,
    _id: { $in: allowedCaseIds },
    $or: [
      { evidenceMediaIds: media._id },
      ...(reportCaseIds.length ? [{ _id: { $in: reportCaseIds } }] : []),
    ],
  }).select("_id assignedSupportId");
}

async function findOrderSnapshotCase(media, user) {
  const orders = await Order.find({ "items.imageIds": media._id })
    .select("_id items._id items.imageIds");
  if (!orders.length) return null;

  const accessFilter = caseReadFilter(user);
  if (!accessFilter) return null;

  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  const cases = await Case.find({
    ...accessFilter,
    targetType: "ORDER",
    targetId: { $in: orders.map((order) => order._id) },
    type: { $in: ["DELIVERY", "ITEM"] },
  }).select("_id targetId type");
  if (!cases.length) return null;

  const complaints = await Complaint.find({ caseId: { $in: cases.map((record) => record._id) } })
    .select("caseId type affectedOrderItemIds");
  const complaintsByCase = new Map();
  for (const complaint of complaints) {
    const key = String(complaint.caseId);
    if (!complaintsByCase.has(key)) complaintsByCase.set(key, []);
    complaintsByCase.get(key).push(complaint);
  }

  for (const caseRecord of cases) {
    const order = orderById.get(String(caseRecord.targetId));
    const caseComplaints = complaintsByCase.get(String(caseRecord._id)) || [];
    if (!order || !caseComplaints.length) continue;

    const allItemsInScope = caseRecord.type === "DELIVERY" &&
      caseComplaints.some((complaint) => complaint.type === "DELIVERY");
    const affectedItemIds = new Set(
      caseComplaints
        .filter((complaint) => complaint.type === "ITEM")
        .flatMap((complaint) => complaint.affectedOrderItemIds.map(String)),
    );
    const hasSnapshotImageInScope = order.items.some((item) =>
      item.imageIds.some((id) => String(id) === String(media._id)) &&
      (allItemsInScope || affectedItemIds.has(String(item._id))),
    );
    if (hasSnapshotImageInScope) return caseRecord;
  }

  return null;
}

async function findListingCase(media, user) {
  const listings = await Listing.find({ "versions.imageIds": media._id })
    .select("_id approvedVersionId versions._id versions.imageIds");
  const listingIds = listings.filter((listing) => {
    const version = listing.versions.id(listing.approvedVersionId) || listing.versions.at(-1);
    return version?.imageIds.some((id) => String(id) === String(media._id));
  }).map((listing) => listing._id);
  if (!listingIds.length) return null;

  const accessFilter = caseReadFilter(user);
  if (!accessFilter) return null;

  return Case.findOne({
    ...accessFilter,
    type: "REPORT",
    targetType: "LISTING",
    targetId: { $in: listingIds },
  }).select("_id");
}

async function recordPrivateMediaRead(req, user, media, { action, caseId = null, scope = null }) {
  if (caseId) {
    return readCaseMedia({
      caseId,
      user,
      media,
      scope,
      requestId: req.requestId,
      action,
    });
  }
  await AuditEvent.create({
    actorId: user._id,
    action,
    targetType: "MEDIA",
    targetId: media._id,
    caseId,
    requestId: req.requestId,
  });
}

router.get("/media/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");
  }

  const media = await Media.findById(req.params.id);
  if (!media) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");

  const user = req.session.userId
    ? await User.findById(req.session.userId)
    : null;
  let audit = null;

  if (user?.role === "USER" && String(media.ownerId) === String(user._id)) {
    audit = media.purpose === "CASE_EVIDENCE" && media.caseId
      ? { action: "CASE_EVIDENCE_READ", caseId: media.caseId, scope: "EVIDENCE" }
      : { action: "MEDIA_PRIVATE_READ" };
  }

  if (!audit && media.purpose === "CASE_EVIDENCE" && user) {
    const evidenceCase = await findEvidenceCase(media, user);
    if (evidenceCase) {
      audit = { action: "CASE_EVIDENCE_READ", caseId: evidenceCase._id, scope: "EVIDENCE" };
    }
  }

  if (!audit && media.purpose === "LISTING" && user?.role === "USER") {
    const order = await Order.findOne({
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
      "items.imageIds": media._id,
    }).select("_id");
    if (order) {
      audit = { action: "MEDIA_PRIVATE_READ" };
    }
  }

  if (!audit && media.purpose === "LISTING" && user) {
    const caseRecord = await findOrderSnapshotCase(media, user);
    if (caseRecord) {
      audit = { action: "CASE_SNAPSHOT_MEDIA_READ", caseId: caseRecord._id, scope: "ORDER_SNAPSHOT" };
    }
  }

  if (!audit && media.purpose === "LISTING" && ["ADMIN", "SUPPORT"].includes(user?.role)) {
    const caseRecord = await findListingCase(media, user);
    if (caseRecord) {
      audit = { action: "MEDIA_PRIVATE_READ", caseId: caseRecord._id, scope: "LISTING_CASE" };
    }
  }

  if (audit) {
    await recordPrivateMediaRead(req, user, media, audit);
  }

  let isPublic = false;
  if (!audit && media.purpose === "LISTING") {
    const listings = await Listing.find(
      approvedVisibleListingQuery({ "versions.imageIds": media._id }),
    );

    isPublic = listings.some((listing) => {
      const version = approvedVersion(listing);
      return version?.imageIds.some((id) => String(id) === String(media._id));
    });
  }

  if (!audit && !isPublic)
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");

  if (audit) res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.type(media.mimeType);
  return res.sendFile(path.join(uploadDir, media.filename));
});

module.exports = router;
