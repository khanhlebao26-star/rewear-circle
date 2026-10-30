const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const User = require("../models/User");
const AuditEvent = require("../models/AuditEvent");
const Notification = require("../models/Notification");
const { readForm } = require("../domain/listingRules");
const { listingBlockReasons } = require("../domain/commerceRules");
const { applyAdminVisibility } = require("../services/moderation");
const {
  requireAuth,
  requireAdmin,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");

async function findOwnedListing(listingId, ownerId, session) {
  if (!mongoose.isValidObjectId(listingId)) return null;
  const query = Listing.findOne({ _id: listingId, ownerId });
  return session ? query.session(session) : query;
}

function sellerListingState(listing) {
  const blockedReasons = listingBlockReasons(listing);

  return {
    listingId: String(listing._id),
    sellerHidden: listing.sellerHidden,
    adminHidden: listing.adminHidden,
    adminHiddenReason: listing.adminHiddenReason,
    reviewHold: listing.reviewHold,
    correctionRequested: listing.correctionRequested,
    correctionReason: listing.correctionReason,
    saleStatus: listing.saleStatus,
    canBuy: blockedReasons.length === 0,
    blockedReasons,
  };
}

function readPagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return null;
  }
  return { page, limit };
}

function notificationForListing({ listing, type, message, reason = "", versionId = null }) {
  return {
    recipientId: listing.ownerId,
    type,
    listingId: listing._id,
    versionId,
    message,
    reason,
  };
}

async function userOwnsImages(imageIds, userId) {
  const count = await Media.countDocuments({
    _id: { $in: imageIds },
    ownerId: userId,
    purpose: { $ne: "CASE_EVIDENCE" },
  });
  return count === imageIds.length;
}

router.post(
  "/listings",
  requireAuth,
  requireVerifiedEmail,
  async (req, res) => {
    const form = readForm(req.body);
    if (!form || !(await userOwnsImages(form.imageIds, req.user._id))) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Dữ liệu tin hoặc ảnh không hợp lệ.",
      );
    }

    const listing = await Listing.create({
      ownerId: req.user._id,
      versions: [{ ...form, status: "PENDING" }],
    });

    return success(req, res, {
      listingId: String(listing._id),
      versionId: String(listing.versions[0]._id),
      status: "PENDING",
    }, 201);
  },
);

router.get("/me/listings", requireAuth, async (req, res) => {
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(req.query.page, 10) || 1),
  );

  const listings = await Listing.find({ ownerId: req.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * 20)
    .limit(20);

  return success(req, res, listings, 200, { page });
});

router.get("/me/listings/:id", requireAuth, async (req, res) => {
  const listing = await findOwnedListing(req.params.id, req.user._id);
  if (!listing) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

  return success(req, res, listing);
});

function notificationDTO(notification) {
  return {
    notificationId: String(notification._id),
    type: notification.type,
    listingId: notification.listingId ? String(notification.listingId) : null,
    orderId: notification.orderId ? String(notification.orderId) : null,
    versionId: notification.versionId ? String(notification.versionId) : null,
    reportId: notification.reportId ? String(notification.reportId) : null,
    complaintId: notification.complaintId ? String(notification.complaintId) : null,
    caseId: notification.caseId ? String(notification.caseId) : null,
    message: notification.message,
    ...(notification.type.startsWith("LISTING_") ? { reason: notification.reason } : {}),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

router.get("/me/notifications", requireAuth, async (req, res) => {
  const pagination = readPagination(req.query);
  if (!pagination) {
    return fail(req, res, 422, "VALIDATION_ERROR", "page/limit không hợp lệ.");
  }

  const { page, limit } = pagination;
  const filter = { recipientId: req.user._id };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);

  res.set("Cache-Control", "private, no-store");
  return success(req, res, items.map(notificationDTO), 200, { page, limit, total, unread });
});

router.patch("/me/notifications/:id/read", requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy thông báo.");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!notification) {
    const alreadyRead = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id,
    });
    if (!alreadyRead) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy thông báo.");
    res.set("Cache-Control", "private, no-store");
    return success(req, res, notificationDTO(alreadyRead));
  }

  res.set("Cache-Control", "private, no-store");
  return success(req, res, notificationDTO(notification));
});

router.get(
  "/me/listings/:id/revisions",
  requireAuth,
  async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user._id);
    if (!listing) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

    return success(req, res, {
      versions: listing.versions,
      resubmissionsUsed: listing.resubmissionCount ?? 0,
      resubmissionsRemaining: Math.max(0, 5 - (listing.resubmissionCount ?? 0)),
    });
  },
);

router.post(
  "/listings/:id/revisions",
  requireAuth,
  requireVerifiedEmail,
  async (req, res) => {
    try {
      const listing = await findOwnedListing(req.params.id, req.user._id);
      if (!listing) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

      if (listing.saleStatus === "SOLD") {
        return fail(req, res, 409, "LISTING_SOLD", "Không thể sửa tin đã bán.");
      }
      if (listing.versions.some((version) => version.status === "PENDING")) {
        return fail(
          req,
          res,
          409,
          "REVISION_PENDING",
          "Tin đã có bản sửa chờ duyệt.",
        );
      }

      const previousVersion = listing.versions[listing.versions.length - 1];
      const isResubmission =
        previousVersion?.status === "REJECTED" || listing.correctionRequested;
      const resubmissionsUsed = listing.resubmissionCount ?? 0;
      if (isResubmission && resubmissionsUsed >= 5) {
        return fail(
          req,
          res,
          409,
          "RESUBMISSION_LIMIT_REACHED",
          "Tin đã đạt giới hạn 5 lượt gửi lại.",
        );
      }

      const form = readForm(req.body);
      if (!form || !(await userOwnsImages(form.imageIds, req.user._id))) {
        return fail(
          req,
          res,
          422,
          "VALIDATION_ERROR",
          "Dữ liệu tin hoặc ảnh không hợp lệ.",
        );
      }

      listing.versions.push({ ...form, status: "PENDING" });
      listing.reviewHold = true;
      listing.correctionRequested = false;
      listing.resubmissionCount = resubmissionsUsed + (isResubmission ? 1 : 0);
      await listing.save();

      const version = listing.versions[listing.versions.length - 1];
      return success(req, res, {
        listingId: String(listing._id),
        versionId: String(version._id),
        status: "PENDING",
        isResubmission,
        resubmissionsUsed: listing.resubmissionCount,
        resubmissionsRemaining: Math.max(0, 5 - listing.resubmissionCount),
      }, 201);
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(
          req,
          res,
          409,
          "CONFLICT",
          "Tin vừa được thay đổi; hãy thử lại.",
        );
      }
      throw error;
    }
  },
);

router.post(
  "/listings/:id/visibility",
  requireAuth,
  async (req, res) => {
    const action = req.body?.action;
    if (!["HIDE", "SHOW"].includes(action)) {
      return fail(req, res, 422, "VALIDATION_ERROR", "action phải là HIDE hoặc SHOW.");
    }

    try {
      const state = await mongoose.connection.transaction(async (session) => {
        const listing = await findOwnedListing(req.params.id, req.user._id, session);
        if (!listing) {
          const error = new Error("Không tìm thấy tin.");
          error.status = 404;
          error.code = "NOT_FOUND";
          throw error;
        }

        if (action === "SHOW") {
          const blockers = listingBlockReasons(listing).filter(
            (reason) => reason !== "SELLER_HIDDEN",
          );
          if (blockers.length) {
            const error = new Error("Tin chưa đủ điều kiện để hiện lại.");
            error.status = 409;
            error.code = "LISTING_UNAVAILABLE";
            throw error;
          }
        }

        const nextHidden = action === "HIDE";
        if (listing.sellerHidden === nextHidden) return sellerListingState(listing);

        listing.sellerHidden = nextHidden;
        await listing.save({ session });
        await AuditEvent.create(
          [{
            actorId: req.user._id,
            action: nextHidden ? "LISTING_SELLER_HIDDEN" : "LISTING_SELLER_SHOWN",
            targetType: "LISTING",
            targetId: listing._id,
            requestId: req.requestId,
            fromState: String(!nextHidden),
            toState: String(nextHidden),
          }],
          { session },
        );
        return sellerListingState(listing);
      });

      return success(req, res, state);
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(req, res, 409, "CONFLICT", "Tin vừa được thay đổi; hãy thử lại.");
      }
      throw error;
    }
  },
);

router.get("/admin/listing-versions", requireAuth, requireAdmin, async (req, res) => {
  if (req.query.status && req.query.status !== "PENDING") {
    return fail(req, res, 422, "VALIDATION_ERROR", "Hàng chờ chỉ hỗ trợ status=PENDING.");
  }
  const pagination = readPagination(req.query);
  if (!pagination) {
    return fail(req, res, 422, "VALIDATION_ERROR", "page/limit không hợp lệ.");
  }

  const { page, limit } = pagination;
  const [result] = await Listing.aggregate([
    { $match: { "versions.status": "PENDING" } },
    { $unwind: "$versions" },
    { $match: { "versions.status": "PENDING" } },
    { $sort: { "versions.submittedAt": -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: User.collection.name,
              localField: "ownerId",
              foreignField: "_id",
              as: "seller",
            },
          },
          { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              listingId: "$_id",
              versionId: "$versions._id",
              submittedAt: "$versions.submittedAt",
              seller: {
                userId: "$seller._id",
                displayName: "$seller.displayName",
              },
              version: {
                title: "$versions.title",
                category: "$versions.category",
                size: "$versions.size",
                condition: "$versions.condition",
                price: "$versions.price",
                imageIds: "$versions.imageIds",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  return success(req, res, result?.items || [], 200, {
    page,
    limit,
    total: result?.total[0]?.count || 0,
  });
});

router.get(
  "/admin/listing-versions/:versionId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.versionId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy phiên bản.");
    }

    const listing = await Listing.findOne({ "versions._id": req.params.versionId });
    if (!listing) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy phiên bản.");
    }

    const version = listing.versions.id(req.params.versionId);
    const [seller, auditHistory] = await Promise.all([
      User.findById(listing.ownerId).select("displayName"),
      AuditEvent.find({
        $or: [
          { targetType: "LISTING", targetId: listing._id },
          { targetType: "LISTING_VERSION", targetId: { $in: listing.versions.map(({ _id }) => _id) } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("actorId action targetType targetId requestId reason fromState toState createdAt")
        .lean(),
    ]);
    return success(req, res, {
      listingId: String(listing._id),
      versionId: String(version._id),
      seller: seller
        ? { userId: String(seller._id), displayName: seller.displayName }
        : null,
      version,
      versions: listing.versions,
      approvedVersionId: listing.approvedVersionId,
      reviewHold: listing.reviewHold,
      sellerHidden: listing.sellerHidden,
      adminHidden: listing.adminHidden,
      adminHiddenReason: listing.adminHiddenReason,
      correctionRequested: listing.correctionRequested,
      saleStatus: listing.saleStatus,
      auditHistory,
    });
  },
);

router.post(
  "/admin/listing-versions/:versionId/decision",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { decision } = req.body || {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (
      !mongoose.isValidObjectId(req.params.versionId) ||
      !["APPROVE", "REJECT"].includes(decision) ||
      (decision === "REJECT" && !reason)
    ) {
      return fail(req, res, 422, "VALIDATION_ERROR", "Quyết định hoặc lý do không hợp lệ.");
    }

    try {
      const result = await mongoose.connection.transaction(async (session) => {
        const listing = await Listing.findOne({ "versions._id": req.params.versionId }).session(session);
        const version = listing?.versions.id(req.params.versionId);
        if (!listing || !version) {
          const error = new Error("Không tìm thấy phiên bản.");
          error.status = 404;
          error.code = "NOT_FOUND";
          throw error;
        }
        if (version.status !== "PENDING") {
          const error = new Error("Phiên bản không còn chờ duyệt.");
          error.status = 409;
          error.code = "REVISION_NOT_PENDING";
          throw error;
        }

        const now = new Date();
        version.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
        version.reviewedBy = req.user._id;
        version.reviewedAt = now;
        version.rejectionReason = decision === "REJECT" ? reason : "";
        listing.correctionRequested = false;
        listing.correctionReason = "";

        if (decision === "APPROVE") {
          listing.approvedVersionId = version._id;
          listing.reviewHold = false;
        } else {
          listing.reviewHold = true;
        }

        await listing.save({ session });
        await AuditEvent.create(
          [{
            actorId: req.user._id,
            action: decision === "APPROVE" ? "LISTING_APPROVED" : "LISTING_REJECTED",
            targetType: "LISTING_VERSION",
            targetId: version._id,
            requestId: req.requestId,
            reason,
            fromState: "PENDING",
            toState: version.status,
          }],
          { session },
        );
        await Notification.create(
          [notificationForListing({
            listing,
            type: decision === "APPROVE" ? "LISTING_APPROVED" : "LISTING_REJECTED",
            message: decision === "APPROVE"
              ? "Phiên bản tin của bạn đã được duyệt."
              : "Phiên bản tin của bạn chưa được duyệt; vui lòng xem lý do và gửi lại nếu cần.",
            reason,
            versionId: version._id,
          })],
          { session },
        );

        return {
          listingId: String(listing._id),
          versionId: String(version._id),
          decision,
          status: version.status,
          approvedVersionId: listing.approvedVersionId
            ? String(listing.approvedVersionId)
            : null,
          reviewHold: listing.reviewHold,
          sellerHidden: listing.sellerHidden,
          adminHidden: listing.adminHidden,
          saleStatus: listing.saleStatus,
        };
      });

      return success(req, res, result);
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(req, res, 409, "CONFLICT", "Tin vừa được thay đổi; hãy thử lại.");
      }
      throw error;
    }
  },
);

router.post(
  "/admin/listings/:id/visibility",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const action = req.body?.action;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const requireCorrection = req.body?.requireCorrection;
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !["HIDE", "SHOW"].includes(action) ||
      !reason ||
      (requireCorrection !== undefined && typeof requireCorrection !== "boolean") ||
      (action === "SHOW" && requireCorrection !== undefined)
    ) {
      return fail(req, res, 422, "VALIDATION_ERROR", "Thao tác, lý do hoặc cờ yêu cầu sửa không hợp lệ.");
    }

    try {
      const state = await mongoose.connection.transaction(async (session) => {
        const listing = await Listing.findById(req.params.id).session(session);
        if (!listing) {
          const error = new Error("Không tìm thấy tin.");
          error.status = 404;
          error.code = "NOT_FOUND";
          throw error;
        }
        return applyAdminVisibility({
          listing,
          action,
          reason,
          requireCorrection: requireCorrection === true,
          actorId: req.user._id,
          requestId: req.requestId,
          session,
        });
      });

      return success(req, res, state);
    } catch (error) {
      if (error.name === "VersionError") {
        return fail(req, res, 409, "CONFLICT", "Tin vừa được thay đổi; hãy thử lại.");
      }
      throw error;
    }
  },
);

module.exports = router;
