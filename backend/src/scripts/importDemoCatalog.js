const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const { readForm } = require("../domain/listingRules");
const { detectImage } = require("../domain/mediaRules");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const User = require("../models/User");
const catalog = require("./data/demo-catalog.json");

const uploadDir = path.resolve(__dirname, "../../uploads");
const maxImageSize = 5 * 1024 * 1024;

async function buildListings(ownerId) {
  const codes = new Set();
  const now = Date.now();
  // Validate product details before downloading and linking the real image.
  const validationImageId = new mongoose.Types.ObjectId().toHexString();

  return Promise.all(catalog.map(async (item, index) => {
    const { code } = item;
    if (!/^RC\d{2,}$/.test(code) || codes.has(code)) {
      throw new Error(`Mã sản phẩm không hợp lệ hoặc bị trùng ở mục ${index + 1}.`);
    }
    codes.add(code);

    const imageUrl = item.image ?? "";
    const image = typeof imageUrl === "string" ? URL.parse(imageUrl) : null;
    if (imageUrl !== "" && (!image || image.protocol !== "https:" || image.username || image.password)) {
      throw new Error(`Mục ${code} cần link ảnh HTTPS trực tiếp.`);
    }
    const form = readForm({ ...item, imageIds: [validationImageId] });
    if (!form) throw new Error(`Dữ liệu sản phẩm ${code} không hợp lệ.`);

    const listingId = createHash("sha256")
      .update(`rewear-demo-catalog:${ownerId}:${code}`)
      .digest("hex")
      .slice(0, 24);
    const versionId = new mongoose.Types.ObjectId();
    const createdAt = new Date(now - index * 1000);
    const listing = new Listing({
      _id: listingId,
      ownerId,
      approvedVersionId: versionId,
      reviewHold: false,
      saleStatus: "AVAILABLE",
      versions: [{
        ...form,
        _id: versionId,
        imageIds: [],
        status: "APPROVED",
        submittedAt: createdAt,
        reviewedAt: createdAt,
      }],
      createdAt,
      updatedAt: createdAt,
    });
    await listing.validate();
    return { code, image, listing };
  }));
}

async function saveImage(image, ownerId) {
  const response = await fetch(image, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Máy chủ ảnh trả về HTTP ${response.status}.`);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxImageSize) throw new Error("Ảnh vượt quá 5 MB.");
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks, size);
  const detected = detectImage(buffer);
  if (!detected) throw new Error("Link phải trả về ảnh JPEG, PNG hoặc WebP.");

  const mediaId = createHash("sha256")
    .update(`rewear-demo-image:${ownerId}:`)
    .update(buffer)
    .digest("hex")
    .slice(0, 24);
  const filename = `demo-catalog-${mediaId}${detected.extension}`;
  await fs.mkdir(uploadDir, { recursive: true });
  const temporaryPath = path.join(uploadDir, `${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, buffer);
    await fs.rename(temporaryPath, path.join(uploadDir, filename));
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }

  await Media.updateOne(
    { _id: mediaId },
    { $setOnInsert: { ownerId, filename, mimeType: detected.mimeType, size } },
    { upsert: true },
  );
  return mediaId;
}

async function updateCatalogImages(products, ownerId, refreshImages) {
  const savedImages = new Map();
  let added = 0;
  let failed = 0;
  for (const { code, image, listing } of products) {
    if (!image) continue;
    const filter = {
      _id: listing._id,
      ownerId,
      saleStatus: "AVAILABLE",
      "versions.0.status": "APPROVED",
      "versions.1": { $exists: false },
      $expr: { $eq: ["$approvedVersionId", { $arrayElemAt: ["$versions._id", 0] }] },
    };
    const current = await Listing.findOne(filter).select("versions.imageIds").lean();
    if (!current) continue;
    const imageIds = current.versions[0].imageIds ?? [];
    const [oldImageId] = imageIds;
    if (oldImageId && (!refreshImages || imageIds.length !== 1 || !await Media.exists({
      _id: oldImageId,
      ownerId,
      purpose: "LISTING",
      filename: /^demo-catalog-/,
    }))) continue;

    try {
      const url = image.href;
      if (!savedImages.has(url)) savedImages.set(url, saveImage(image, ownerId));
      const mediaId = await savedImages.get(url);
      if (String(oldImageId) === mediaId) continue;
      const result = await Listing.updateOne(
        { ...filter, "versions.0.imageIds": imageIds },
        { $set: { "versions.0.imageIds": [mediaId] }, $inc: { __v: 1 } },
      );
      added += result.modifiedCount;
    } catch (error) {
      failed++;
      console.error(`Chưa thêm được ảnh cho ${code}. ${error.message}`);
    }
  }
  console.log(`Đã cập nhật ảnh cho ${added} món, ${failed} món gặp lỗi ảnh.`);
  if (failed) process.exitCode = 1;
}

async function main() {
  const argument = process.argv[2]?.trim().toLowerCase();
  if (argument === "--check") {
    const listings = await buildListings(new mongoose.Types.ObjectId());
    console.log(`Đã kiểm tra ${listings.length} sản phẩm mẫu.`);
    return;
  }

  if (!argument) throw new Error("Hãy truyền email của tài khoản người bán.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Chỉ nhập bộ sản phẩm mẫu trong môi trường phát triển hoặc demo.");
  }
  if (!process.env.MONGODB_URI) throw new Error("Thiếu cấu hình MONGODB_URI.");

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const seller = await User.findOne({ email: argument, role: "USER" })
    .select("_id emailVerifiedAt")
    .lean();
  if (!seller?.emailVerifiedAt) {
    throw new Error("Cần một tài khoản người dùng đã xác minh email trong database này.");
  }

  const products = await buildListings(seller._id);
  const result = await Listing.bulkWrite(products.map(({ listing }) => ({
    updateOne: {
      filter: { _id: listing._id },
      update: { $setOnInsert: listing.toObject() },
      upsert: true,
      timestamps: false,
    },
  })));
  console.log(`MongoDB ${mongoose.connection.name} | Thêm ${result.upsertedCount} món, bỏ qua ${result.matchedCount} món đã có.`);
  await updateCatalogImages(products, seller._id, process.argv.includes("--refresh-images", 3));
}

main()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(`Nhập sản phẩm mẫu thất bại. ${error.message}`);
    process.exitCode = 1;
  });
