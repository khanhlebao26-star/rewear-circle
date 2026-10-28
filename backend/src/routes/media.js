const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const Media = require("../models/Media");
const Listing = require("../models/Listing");
const User = require("../models/User");
const { approvedVersion, approvedVisibleListingQuery } = require("../domain/commerceRules");
const { detectImage } = require("../domain/mediaRules");
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

    try {
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
        });
        createdIds.push(media._id);

        data.push({
          mediaId: String(media._id),
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

router.get("/media/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");
  }

  const media = await Media.findById(req.params.id);
  if (!media) return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");

  const user = req.session.userId
    ? await User.findById(req.session.userId)
    : null;
  let allowed =
    user &&
    (String(media.ownerId) === String(user._id) || user.role === "ADMIN");

  if (!allowed) {
    const listings = await Listing.find(
      approvedVisibleListingQuery({ "versions.imageIds": media._id }),
    );

    allowed = listings.some((listing) => {
      const version = approvedVersion(listing);
      return version?.imageIds.some((id) => String(id) === String(media._id));
    });
  }

  if (!allowed)
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy ảnh.");

  res.type(media.mimeType);
  return res.sendFile(path.join(uploadDir, media.filename));
});

module.exports = router;
