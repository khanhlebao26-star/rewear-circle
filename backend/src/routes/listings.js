const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const {
  requireAuth,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");

function fail(req, res, status, code, message) {
  return res.status(status).json({
    error: { code, message, retryable: false },
    meta: { requestId: req.requestId },
  });
}

function readForm(body = {}) {
  const sizes = {
    Áo: ["XS", "S", "M", "L", "XL", "XXL"],
    Quần: ["XS", "S", "M", "L", "XL", "XXL"],
    Giày: Array.from({ length: 11 }, (_, i) => String(i + 35)),
    "Phụ kiện": ["FREE_SIZE"],
  };

  const form = {
    title: String(body.title || "").trim(),
    category: String(body.category || "").trim(),
    size: String(body.size || "").trim(),
    condition: String(body.condition || "").trim(),
    description: String(body.description || "").trim(),
    flaws: String(body.flaws || "").trim(),
    price: body.price,
    shipFrom: String(body.shipFrom || "").trim(),
    imageIds: body.imageIds,
  };

  if (
    form.title.length < 5 ||
    form.title.length > 100 ||
    !sizes[form.category]?.includes(form.size) ||
    !form.condition ||
    form.condition.length > 40 ||
    form.description.length < 20 ||
    form.description.length > 2000 ||
    form.flaws.length > 1000 ||
    !Number.isInteger(form.price) ||
    form.price < 20000 ||
    form.price > 5000000 ||
    !form.shipFrom ||
    form.shipFrom.length > 100 ||
    !Array.isArray(form.imageIds) ||
    form.imageIds.length < 1 ||
    form.imageIds.length > 5 ||
    new Set(form.imageIds).size !== form.imageIds.length ||
    !form.imageIds.every((id) => mongoose.isValidObjectId(id))
  ) {
    return null;
  }

  return form;
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
  async (req, res, next) => {
    try {
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

      return res.status(201).json({
        data: {
          listingId: String(listing._id),
          versionId: String(listing.versions[0]._id),
          status: "PENDING",
        },
        meta: { requestId: req.requestId },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/me/listings", requireAuth, async (req, res, next) => {
  try {
    const page = Math.min(
      10000,
      Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    );

    const listings = await Listing.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20);

    return res.json({
      data: listings,
      meta: { requestId: req.requestId, page },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me/listings/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");
    }

    const listing = await Listing.findOne({
      _id: req.params.id,
      ownerId: req.user._id,
    });
    if (!listing)
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

    return res.json({
      data: listing,
      meta: { requestId: req.requestId },
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/me/listings/:id/revisions",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");
      }

      const listing = await Listing.findOne({
        _id: req.params.id,
        ownerId: req.user._id,
      });
      if (!listing) {
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");
      }

      return res.json({
        data: listing.versions,
        meta: { requestId: req.requestId },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/listings/:id/revisions",
  requireAuth,
  requireVerifiedEmail,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");
      }

      const listing = await Listing.findOne({
        _id: req.params.id,
        ownerId: req.user._id,
      });
      if (!listing)
        return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy tin.");

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
      return res.status(201).json({
        data: {
          listingId: String(listing._id),
          versionId: String(version._id),
          status: "PENDING",
        },
        meta: { requestId: req.requestId },
      });
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
      next(error);
    }
  },
);

module.exports = router;
