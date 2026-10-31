const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const mongoUri = process.env.MONGODB_TEST_URI;

test("DISC feed, filters, visibility, detail DTO, and public media access", {
  skip: !mongoUri && "Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database ending in _test",
}, async () => {
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
  assert.match(databaseName, /_test$/, "MONGODB_TEST_URI must name a database ending in _test");

  process.env.MONGODB_URI = mongoUri;
  process.env.SESSION_SECRET = "discovery-test-session-secret";

  const mongoose = require("mongoose");
  const express = require("express");
  const User = require("../src/models/User");
  const Listing = require("../src/models/Listing");
  const Media = require("../src/models/Media");
  const AuditEvent = require("../src/models/AuditEvent");
  const Notification = require("../src/models/Notification");
  const models = [User, Listing, Media, AuditEvent, Notification];
  const uploadDir = path.resolve(__dirname, "../uploads");
  const filenames = [];
  let server;

  await mongoose.connect(mongoUri);
  try {
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(models.map((Model) => Model.init()));

    const [buyer, seller, admin] = await User.create([
      { email: "buyer@discovery.test", passwordHash: "unused", displayName: "Buyer", emailVerifiedAt: new Date() },
      { email: "seller@discovery.test", passwordHash: "unused", displayName: "Seller", emailVerifiedAt: new Date() },
      { email: "admin@discovery.test", passwordHash: "unused", displayName: "Admin", role: "ADMIN", emailVerifiedAt: new Date() },
    ]);
    const imageBytes = Buffer.from("public-listing-image");
    await fs.mkdir(uploadDir, { recursive: true });

    async function makeListing({
      title,
      description = "Một món đồ đã qua sử dụng, còn tốt và sẵn sàng tìm người mặc tiếp.",
      category = "Áo",
      size = "M",
      condition = "Còn tốt",
      price = 120000,
      status = "APPROVED",
      saleStatus = "AVAILABLE",
      reviewHold = false,
      correctionRequested = false,
      sellerHidden = false,
      adminHidden = false,
      paymentReviewHold = false,
      approvedIndex = 0,
      versionSpecs,
      createdAt = new Date(),
      image = false,
    }) {
      const imageId = new mongoose.Types.ObjectId();
      let imageIds = [];
      if (image) {
        const filename = `discovery-${randomUUID()}.png`;
        filenames.push(filename);
        await fs.writeFile(path.join(uploadDir, filename), imageBytes);
        await Media.create({
          _id: imageId,
          ownerId: seller._id,
          filename,
          mimeType: "image/png",
          size: imageBytes.length,
          purpose: "LISTING",
        });
        imageIds = [imageId];
      }

      const specs = versionSpecs || [{
        title,
        description,
        category,
        size,
        condition,
        price,
        imageIds,
        status,
      }];
      const versions = specs.map((spec) => ({
        title: spec.title,
        category: spec.category ?? category,
        size: spec.size ?? size,
        condition: spec.condition ?? condition,
        description: spec.description ?? description,
        flaws: spec.flaws ?? "Có vết xước nhẹ ở mặt trong.",
        price: spec.price ?? price,
        shipFrom: spec.shipFrom ?? "Hà Nội",
        imageIds: spec.imageIds ?? imageIds,
        status: spec.status ?? "APPROVED",
        rejectionReason: spec.rejectionReason ?? "Ghi chú duyệt riêng tư",
      }));
      const listing = new Listing({
        ownerId: seller._id,
        versions,
        reviewHold,
        correctionRequested,
        correctionReason: correctionRequested ? "Ghi chú sửa riêng tư" : "",
        sellerHidden,
        adminHidden,
        adminHiddenReason: adminHidden ? "Ghi chú admin riêng tư" : "",
        paymentReviewHold,
        saleStatus,
        createdAt,
        updatedAt: createdAt,
      });
      listing.approvedVersionId = listing.versions[approvedIndex]?._id || null;
      await listing.save();
      return listing;
    }

    const listings = [];
    const listingEpoch = Date.now();
    for (let index = 0; index < 25; index += 1) {
      const special = index === 0;
      listings.push(await makeListing({
        title: special ? "Cedar cotton tee" : `Món đồ mẫu ${index}`,
        description: special
          ? "Áo cotton tuyển chọn, mặc nhẹ và còn tốt."
          : "Một món đồ đã qua sử dụng, còn tốt và sẵn sàng tìm người mặc tiếp.",
        category: special ? "Áo" : ["Áo", "Quần", "Giày", "Phụ kiện"][index % 4],
        size: special ? "M" : ["S", "M", "L", "38", "FREE_SIZE"][index % 5],
        condition: special ? "Còn tốt" : ["Mới", "Còn mới", "Còn tốt", "Đã sử dụng"][index % 4],
        price: special ? 120000 : 70000 + index * 25000,
        createdAt: new Date(listingEpoch - Math.min(index, 23) * 60_000),
        image: special,
        versionSpecs: special ? [
          { title: "Tên revision đã duyệt cũ", status: "APPROVED" },
          {
            title: "Cedar cotton tee",
            description: "Áo cotton tuyển chọn, mặc nhẹ và còn tốt.",
            category: "Áo",
            size: "M",
            condition: "Còn tốt",
            price: 120000,
            status: "APPROVED",
          },
          { title: "Bản nháp không được tìm thấy", status: "PENDING" },
        ] : undefined,
        approvedIndex: special ? 1 : 0,
      }));
    }

    const notPublic = await Promise.all([
      makeListing({ title: "Seller hidden", sellerHidden: true, image: true }),
      makeListing({ title: "Admin hidden", adminHidden: true, image: true }),
      makeListing({ title: "On review hold", reviewHold: true }),
      makeListing({ title: "Correction requested", correctionRequested: true }),
      makeListing({ title: "Payment review", paymentReviewHold: true }),
      makeListing({ title: "Pending only", status: "PENDING" }),
      makeListing({
        title: "Wrong approved pointer",
        versionSpecs: [
          { title: "Approved but not selected", status: "APPROVED" },
          { title: "Selected pending revision", status: "PENDING" },
        ],
        approvedIndex: 1,
      }),
    ]);
    const reserved = await makeListing({ title: "Reserved detail", saleStatus: "RESERVED" });
    const sold = await makeListing({ title: "Sold detail", saleStatus: "SOLD" });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.requestId = randomUUID();
      req.session = { userId: req.get("x-test-user-id") };
      next();
    });
    app.use("/api/v1", require("../src/routes/media"));
    app.use("/api/v1", require("../src/routes/listings"));
    app.use("/api/v1", require("../src/routes/commerce"));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      return res.status(error.status || 500).json({
        error: { code: error.code || "INTERNAL_ERROR", message: error.message },
      });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    async function request(pathname, user, { method = "GET", body } = {}) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          ...(user ? { "x-test-user-id": String(user._id) } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
      return { response, data };
    }

    const guestFeed = await request("/listings");
    assert.equal(guestFeed.response.status, 200);
    assert.equal(guestFeed.data.meta.page, 1);
    assert.equal(guestFeed.data.meta.limit, 20);
    assert.equal(guestFeed.data.meta.total, 25);
    assert.equal(guestFeed.data.data.length, 20);
    assert.equal(guestFeed.data.data[0].listingId, String(listings[0]._id));
    assert.deepEqual(guestFeed.data.data[0].title, "Cedar cotton tee");
    assert.equal("description" in guestFeed.data.data[0], false);
    assert.equal("adminHiddenReason" in guestFeed.data.data[0], false);
    assert.equal("correctionReason" in guestFeed.data.data[0], false);

    const guestFilter = await request("/listings?q=cedar");
    assert.equal(guestFilter.response.status, 401);
    assert.equal(guestFilter.data.error.code, "UNAUTHORIZED");

    const secondPage = await request("/listings?page=2&limit=20");
    assert.equal(secondPage.data.data.length, 5);
    assert.equal(secondPage.data.meta.total, 25);
    assert.equal(new Set([...guestFeed.data.data, ...secondPage.data.data].map((item) => item.listingId)).size, 25);
    const maxPageSize = await request("/listings?limit=100");
    assert.equal(maxPageSize.data.data.length, 25);
    assert.equal(maxPageSize.data.meta.limit, 100);
    const sortedListings = [...listings].sort((left, right) =>
      right.createdAt - left.createdAt || String(right._id).localeCompare(String(left._id)));
    assert.deepEqual(
      maxPageSize.data.data.map((item) => item.listingId),
      sortedListings.map((listing) => String(listing._id)),
    );
    const publicIds = new Set(maxPageSize.data.data.map((item) => item.listingId));
    assert.equal(publicIds.has(String(reserved._id)), false);
    assert.equal(publicIds.has(String(sold._id)), false);
    const badLimit = await request("/listings?limit=101", buyer);
    assert.equal(badLimit.response.status, 422);
    assert.equal(badLimit.data.error.code, "VALIDATION_ERROR");

    const filterCases = [
      ["q=cedar", (item) => item.title === "Cedar cotton tee"],
      ["category=Qu%E1%BA%A7n", (item) => item.category === "Quần"],
      ["size=38", (item) => item.size === "38"],
      ["condition=C%C3%B2n+t%E1%BB%91t", (item) => item.condition === "Còn tốt"],
      ["minPrice=120000", (item) => item.price >= 120000],
      ["maxPrice=120000", (item) => item.price <= 120000],
    ];
    for (const [query, matches] of filterCases) {
      const result = await request(`/listings?${query}&limit=100`, buyer);
      assert.equal(result.response.status, 200, query);
      assert.ok(result.data.data.length > 0, query);
      assert.ok(result.data.data.every(matches), query);
      assert.equal(result.data.meta.total, result.data.data.length, query);
    }

    const combined = await request(
      "/listings?q=cedar&category=%C3%81o&size=M&condition=C%C3%B2n+t%E1%BB%91t&minPrice=120000&maxPrice=120000",
      buyer,
    );
    assert.equal(combined.response.status, 200);
    assert.equal(combined.data.meta.total, 1);
    assert.equal(combined.data.data[0].title, "Cedar cotton tee");

    const escapedSearch = await request("/listings?q=cedar.%2A", buyer);
    assert.equal(escapedSearch.response.status, 200);
    assert.equal(escapedSearch.data.meta.total, 0);

    for (const query of [
      "q=%20",
      "category=Unknown",
      "category=%C3%81o&size=38",
      "minPrice=5000010",
      "minPrice=500000&maxPrice=20000",
      "unknown=value",
    ]) {
      const result = await request(`/listings?${query}`, buyer);
      assert.equal(result.response.status, 422, query);
      assert.equal(result.data.error.code, "VALIDATION_ERROR", query);
    }

    const currentDetail = await request(`/listings/${listings[0]._id}`);
    assert.equal(currentDetail.response.status, 200);
    assert.equal(currentDetail.data.data.title, "Cedar cotton tee");
    assert.equal(currentDetail.data.data.versionId, String(listings[0].versions[1]._id));
    assert.equal(currentDetail.data.data.canBuy, true);
    for (const privateField of ["ownerId", "adminHiddenReason", "correctionReason", "reviewedBy", "rejectionReason", "email"]) {
      assert.equal(privateField in currentDetail.data.data, false, privateField);
    }

    const reservedDetail = await request(`/listings/${reserved._id}`);
    assert.equal(reservedDetail.response.status, 200);
    assert.equal(reservedDetail.data.data.canBuy, false);
    assert.equal(reservedDetail.data.data.watermark, null);
    const soldDetail = await request(`/listings/${sold._id}`);
    assert.equal(soldDetail.response.status, 200);
    assert.equal(soldDetail.data.data.canBuy, false);
    assert.equal(soldDetail.data.data.watermark, "Đã bán");

    for (const listing of notPublic) {
      const detail = await request(`/listings/${listing._id}`);
      assert.equal(detail.response.status, 404, listing.versions[0].title);
    }

    const publicImage = await request(`/media/${listings[0].versions[1].imageIds[0]}`);
    assert.equal(publicImage.response.status, 200);
    assert.deepEqual(publicImage.data, imageBytes);
    const hiddenImageId = notPublic[0].versions[0].imageIds[0];
    const hiddenImage = await request(`/media/${hiddenImageId}`);
    assert.equal(hiddenImage.response.status, 404);
    assert.equal(hiddenImage.data.error.code, "NOT_FOUND");

    const adminHide = await request(`/admin/listings/${listings[0]._id}/visibility`, admin, {
      method: "POST",
      body: { action: "HIDE", reason: "Step G visibility acceptance" },
    });
    assert.equal(adminHide.response.status, 200);
    assert.equal(adminHide.data.data.adminHidden, true);
    assert.equal(await AuditEvent.countDocuments({ targetId: listings[0]._id, action: "LISTING_ADMIN_HIDDEN" }), 1);
    assert.equal(await Notification.countDocuments({ listingId: listings[0]._id, type: "LISTING_HIDDEN" }), 1);
    assert.equal((await request("/listings")).data.meta.total, 24);
    assert.equal((await request(`/listings/${listings[0]._id}`)).response.status, 404);
    assert.equal((await request(`/media/${listings[0].versions[1].imageIds[0]}`)).response.status, 404);

    const adminShow = await request(`/admin/listings/${listings[0]._id}/visibility`, admin, {
      method: "POST",
      body: { action: "SHOW", reason: "Step G restore visibility acceptance" },
    });
    assert.equal(adminShow.response.status, 200);
    assert.equal(adminShow.data.data.adminHidden, false);
    assert.equal((await request("/listings")).data.meta.total, 25);

    const uploadBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const uploadForm = new FormData();
    uploadForm.set("images", new Blob([uploadBytes], { type: "image/png" }), "acceptance.png");
    const uploadResponse = await fetch(`${baseUrl}/media/upload-requests`, {
      method: "POST",
      headers: { "x-test-user-id": String(buyer._id) },
      body: uploadForm,
    });
    const uploadResult = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    const uploadedMedia = await Media.findById(uploadResult.data[0].mediaId);
    assert.ok(uploadedMedia);
    filenames.push(uploadedMedia.filename);
    const uploadedImage = await request(`/media/${uploadedMedia._id}`, buyer);
    assert.equal(uploadedImage.response.status, 200);
    assert.deepEqual(uploadedImage.data, uploadBytes);
    const privateImageAsGuest = await request(`/media/${uploadedMedia._id}`);
    assert.equal(privateImageAsGuest.response.status, 404);
    assert.equal(await AuditEvent.countDocuments({ targetId: uploadedMedia._id, action: "MEDIA_PRIVATE_READ" }), 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(models.map((Model) => Model.deleteMany({})));
    await Promise.all(filenames.map((filename) => fs.rm(path.join(uploadDir, filename), { force: true })));
    await mongoose.disconnect();
  }
});
