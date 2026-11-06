const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../../models/Listing");
const Media = require("../../models/Media");
const AuditEvent = require("../../models/AuditEvent");
const { readForm } = require("../../domain/listingRules");
const { listingBlockReasons } = require("../../domain/commerceRules");
const { requireAuth, requireRole, requireVerifiedEmail } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");

const requireUser = requireRole("USER");

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

async function userOwnsImages(imageIds, userId) {
  const count = await Media.countDocuments({
    _id: { $in: imageIds },
    ownerId: userId,
    purpose: "LISTING",
  });
  return count === imageIds.length;
}

router.post(
  "/listings",
  requireAuth,
  requireUser,
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

    return success(
      req,
      res,
      {
        listingId: String(listing._id),
        versionId: String(listing.versions[0]._id),
        status: "PENDING",
      },
      201,
    );
  },
);

router.get("/me/listings", requireAuth, requireUser, async (req, res) => {
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

router.get("/me/listings/:id", requireAuth, requireUser, async (req, res) => {
  const listing = await findOwnedListing(req.params.id, req.user._id);
  if (!listing) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

  return success(req, res, listing);
});

router.get(
  "/me/listings/:id/revisions",
  requireAuth,
  requireUser,
  async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user._id);
    if (!listing)
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

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
  requireUser,
  requireVerifiedEmail,
  async (req, res) => {
    try {
      const listing = await findOwnedListing(req.params.id, req.user._id);
      if (!listing)
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

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
      return success(
        req,
        res,
        {
          listingId: String(listing._id),
          versionId: String(version._id),
          status: "PENDING",
          isResubmission,
          resubmissionsUsed: listing.resubmissionCount,
          resubmissionsRemaining: Math.max(0, 5 - listing.resubmissionCount),
        },
        201,
      );
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
  requireUser,
  async (req, res) => {
    const action = req.body?.action;
    if (!["HIDE", "SHOW"].includes(action)) {
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "action phải là HIDE hoặc SHOW.",
      );
    }

    try {
      const state = await mongoose.connection.transaction(async (session) => {
        const listing = await findOwnedListing(
          req.params.id,
          req.user._id,
          session,
        );
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
        if (listing.sellerHidden === nextHidden)
          return sellerListingState(listing);

        listing.sellerHidden = nextHidden;
        await listing.save({ session });
        await AuditEvent.create(
          [
            {
              actorId: req.user._id,
              action: nextHidden
                ? "LISTING_SELLER_HIDDEN"
                : "LISTING_SELLER_SHOWN",
              targetType: "LISTING",
              targetId: listing._id,
              requestId: req.requestId,
              fromState: String(!nextHidden),
              toState: String(nextHidden),
            },
          ],
          { session },
        );
        return sellerListingState(listing);
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
