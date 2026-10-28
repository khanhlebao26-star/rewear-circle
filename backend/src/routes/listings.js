const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const { readForm } = require("../domain/listingRules");
const {
  requireAuth,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const { success, failure: fail } = require("../http/responses");

async function findOwnedListing(listingId, ownerId) {
  if (!mongoose.isValidObjectId(listingId)) return null;
  return Listing.findOne({ _id: listingId, ownerId });
}

async function userOwnsImages(imageIds, userId) {
  const count = await Media.countDocuments({
    _id: { $in: imageIds },
    ownerId: userId,
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

router.get(
  "/me/listings/:id/revisions",
  requireAuth,
  async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user._id);
    if (!listing) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

    return success(req, res, listing.versions);
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

      if (
        listing.saleStatus === "RESERVED" &&
        listing.reservedUntil &&
        listing.reservedUntil > new Date()
      ) {
        return fail(
          req,
          res,
          409,
          "LISTING_RESERVED",
          "Món đang được giữ để checkout; chưa thể sửa.",
        );
      }

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
      await listing.save();

      const version = listing.versions[listing.versions.length - 1];
      return success(req, res, {
        listingId: String(listing._id),
        versionId: String(version._id),
        status: "PENDING",
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

module.exports = router;
