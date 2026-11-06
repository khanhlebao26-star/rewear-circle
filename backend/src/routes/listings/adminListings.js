const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../../models/Listing");
const User = require("../../models/User");
const AuditEvent = require("../../models/AuditEvent");
const Notification = require("../../models/Notification");
const { applyAdminVisibility } = require("../../services/moderation");
const { requireAuth, requireAdmin } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");
const { readPagination } = require("../../http/readPagination");

function notificationForListing({
  listing,
  type,
  message,
  reason = "",
  versionId = null,
}) {
  return {
    recipientId: listing.ownerId,
    type,
    listingId: listing._id,
    versionId,
    message,
    reason,
  };
}

router.get(
  "/admin/listings",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { q = "", reviewStatus, visibility } = req.query;
    const pagination = readPagination(req.query);
    if (
      !pagination ||
      !Number.isSafeInteger((pagination.page - 1) * pagination.limit) ||
      Object.keys(req.query).some((key) => !["page", "limit", "q", "reviewStatus", "visibility"].includes(key)) ||
      typeof q !== "string" || q.length > 100 ||
      (reviewStatus !== undefined && !["PENDING", "APPROVED", "REJECTED"].includes(reviewStatus)) ||
      (visibility !== undefined && !["PUBLIC", "HIDDEN", "UNPUBLISHED"].includes(visibility))
    ) {
      return fail(req, res, 422, "VALIDATION_ERROR", "Bộ lọc hoặc phân trang không hợp lệ.");
    }

    const { page, limit } = pagination;
    const keyword = q.trim();
    const filter = {};
    if (reviewStatus) filter["latestVersion.status"] = reviewStatus;
    if (visibility) filter.visibility = visibility;
    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ "latestVersion.title": { $regex: escaped, $options: "i" } }];
      if (/^[a-f\d]{24}$/i.test(keyword)) {
        filter.$or.push({ _id: new mongoose.Types.ObjectId(keyword) });
      } else if (/^[a-f\d]{8}$/i.test(keyword)) {
        filter.$or.push({
          $expr: { $eq: [
            { $substrBytes: [{ $toString: "$_id" }, 16, 8] },
            keyword.toLowerCase(),
          ] },
        });
      }
    }

    const [result] = await Listing.aggregate([
      { $set: {
        latestVersion: { $arrayElemAt: ["$versions", -1] },
        approvedVersion: { $first: { $filter: {
          input: { $ifNull: ["$versions", []] },
          as: "version",
          cond: { $eq: ["$$version._id", "$approvedVersionId"] },
        } } },
      } },
      { $set: { visibility: { $switch: {
        branches: [
          { case: { $or: ["$adminHidden", "$sellerHidden"] }, then: "HIDDEN" },
          { case: { $and: [
            { $eq: ["$approvedVersion.status", "APPROVED"] },
            { $in: ["$saleStatus", ["AVAILABLE", "RESERVED", "SOLD"]] },
            { $not: [{ $or: ["$reviewHold", "$correctionRequested", "$paymentReviewHold"] }] },
          ] }, then: "PUBLIC" },
        ],
        default: "UNPUBLISHED",
      } } } },
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: {
            from: User.collection.name,
            localField: "ownerId",
            foreignField: "_id",
            as: "seller",
          } },
          { $project: {
            _id: 0,
            listingId: "$_id",
            versionId: "$latestVersion._id",
            title: "$latestVersion.title",
            price: "$latestVersion.price",
            imageId: { $arrayElemAt: ["$latestVersion.imageIds", 0] },
            reviewStatus: "$latestVersion.status",
            sellerName: { $arrayElemAt: ["$seller.displayName", 0] },
            saleStatus: 1,
            visibility: 1,
          } },
        ],
        total: [{ $count: "count" }],
      } },
    ]);

    return success(req, res, result?.items || [], 200, {
      page,
      limit,
      total: result?.total[0]?.count || 0,
    });
  },
);

router.get(
  "/admin/listing-versions",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (req.query.status && req.query.status !== "PENDING") {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Hàng chờ chỉ hỗ trợ status=PENDING.",
      );
    }
    const pagination = readPagination(req.query);
    if (!pagination) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "page/limit không hợp lệ.",
      );
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
  },
);

router.get(
  "/admin/listing-versions/:versionId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.versionId)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy phiên bản.");
    }

    const listing = await Listing.findOne({
      "versions._id": req.params.versionId,
    });
    if (!listing) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy phiên bản.");
    }

    const version = listing.versions.id(req.params.versionId);
    const [seller, auditHistory] = await Promise.all([
      User.findById(listing.ownerId).select("displayName"),
      AuditEvent.find({
        $or: [
          { targetType: "LISTING", targetId: listing._id },
          {
            targetType: "LISTING_VERSION",
            targetId: { $in: listing.versions.map(({ _id }) => _id) },
          },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select(
          "actorId action targetType targetId requestId reason fromState toState createdAt",
        )
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
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (
      !mongoose.isValidObjectId(req.params.versionId) ||
      !["APPROVE", "REJECT"].includes(decision) ||
      (decision === "REJECT" && !reason)
    ) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Quyết định hoặc lý do không hợp lệ.",
      );
    }

    try {
      const result = await mongoose.connection.transaction(async (session) => {
        const listing = await Listing.findOne({
          "versions._id": req.params.versionId,
        }).session(session);
        const version = listing?.versions.id(req.params.versionId);
        if (!listing || !version) {
          const error = new Error("Không tìm thấy phiên bản.");
          error.status = 404;
          error.code = "NOT_FOUND";
          throw error;
        }
        if (String(listing.ownerId) === String(req.user._id)) {
          const error = new Error("Không được tự kiểm duyệt tin của mình.");
          error.status = 403;
          error.code = "SELF_REVIEW_FORBIDDEN";
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
          [
            {
              actorId: req.user._id,
              action:
                decision === "APPROVE"
                  ? "LISTING_APPROVED"
                  : "LISTING_REJECTED",
              targetType: "LISTING_VERSION",
              targetId: version._id,
              requestId: req.requestId,
              reason,
              fromState: "PENDING",
              toState: version.status,
            },
          ],
          { session },
        );
        await Notification.create(
          [
            notificationForListing({
              listing,
              type:
                decision === "APPROVE"
                  ? "LISTING_APPROVED"
                  : "LISTING_REJECTED",
              message:
                decision === "APPROVE"
                  ? "Phiên bản tin của bạn đã được duyệt."
                  : "Phiên bản tin của bạn chưa được duyệt; vui lòng xem lý do và gửi lại nếu cần.",
              reason,
              versionId: version._id,
            }),
          ],
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
  "/admin/listings/:id/visibility",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const action = req.body?.action;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const requireCorrection = req.body?.requireCorrection;
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !["HIDE", "SHOW"].includes(action) ||
      !reason ||
      (requireCorrection !== undefined &&
        typeof requireCorrection !== "boolean") ||
      (action === "SHOW" && requireCorrection !== undefined)
    ) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Thao tác, lý do hoặc cờ yêu cầu sửa không hợp lệ.",
      );
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

module.exports = router;
