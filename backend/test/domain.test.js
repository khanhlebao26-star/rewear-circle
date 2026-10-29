const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { readForm } = require("../src/domain/listingRules");
const {
  validId,
  approvedVersion,
  approvedVisibleListingQuery,
  snapshot,
  availableStates,
  sameSelection,
  readAddress,
} = require("../src/domain/commerceRules");
const { detectImage } = require("../src/domain/mediaRules");
const { readListingReport, readCaseDecision } = require("../src/domain/moderationRules");
const { readDiscoveryQuery } = require("../src/domain/discoveryRules");
const { success, failure } = require("../src/http/responses");

const imageId = new mongoose.Types.ObjectId().toString();

test("listing form accepts valid input and rejects invalid sizes and duplicate images", () => {
  const input = {
    title: " Áo sơ mi đã qua sử dụng ",
    category: "Áo",
    size: "M",
    condition: "Còn tốt",
    description: "Áo đã giặt sạch, không rách và còn sử dụng tốt.",
    flaws: "",
    price: 120000,
    shipFrom: "Hồ Chí Minh",
    imageIds: [imageId],
  };

  assert.equal(readForm(input).title, "Áo sơ mi đã qua sử dụng");
  assert.equal(readForm({ ...input, size: "45" }), null);
  assert.equal(readForm({ ...input, imageIds: [imageId, imageId] }), null);
});

test("listing availability requires an approved visible version", () => {
  const version = {
    _id: "version-1",
    status: "APPROVED",
    title: "Áo sơ mi",
    price: 120000,
    imageIds: [imageId],
  };
  const listing = {
    _id: "listing-1",
    ownerId: "seller-1",
    approvedVersionId: version._id,
    versions: { id: (id) => (id === version._id ? version : null) },
  };

  assert.equal(approvedVersion(listing), version);
  assert.equal(snapshot(listing).price, 120000);
  assert.equal(approvedVersion({ ...listing, adminHidden: true }), null);
  assert.equal(approvedVersion({ ...listing, reviewHold: true }), null);
  assert.equal(approvedVersion({ ...listing, versions: { id: () => ({ status: "PENDING" }) } }), null);

  assert.deepEqual(approvedVisibleListingQuery({ "versions.imageIds": imageId }), {
    "versions.imageIds": imageId,
    approvedVersionId: { $ne: null },
    reviewHold: false,
    correctionRequested: { $ne: true },
    sellerHidden: false,
    adminHidden: false,
    paymentReviewHold: { $ne: true },
  });
  assert.equal(
    approvedVisibleListingQuery({ approvedVersionId: version._id }).approvedVersionId,
    version._id,
  );
});

test("commerce rules validate IDs, addresses, idempotency, and expired holds", () => {
  const listingId = new mongoose.Types.ObjectId().toString();
  assert.equal(validId(listingId), true);
  assert.equal(validId("bad-id"), false);

  assert.deepEqual(readAddress({
    fullName: "  Nguyen Van A ",
    phone: "+84901234567",
    address: "  123 Nguyen Hue, District 1  ",
  }), {
    fullName: "Nguyen Van A",
    phone: "+84901234567",
    address: "123 Nguyen Hue, District 1",
  });
  assert.throws(() => readAddress({}), { code: "INVALID_ADDRESS", status: 422 });

  assert.doesNotThrow(() => sameSelection({ items: [{ listingId }] }, [listingId]));
  assert.throws(
    () => sameSelection({ items: [{ listingId }] }, [new mongoose.Types.ObjectId().toString()]),
    { code: "REQUEST_KEY_REUSED", status: 409 },
  );

  const now = new Date();
  assert.deepEqual(availableStates(now), [
    { saleStatus: "AVAILABLE" },
    { saleStatus: "RESERVED", reservedUntil: { $lte: now } },
  ]);
});

test("image detection accepts JPEG, PNG, and WebP signatures only", () => {
  assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mimeType, "image/jpeg");
  assert.equal(
    detectImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])).mimeType,
    "image/png",
  );
  assert.equal(
    detectImage(Buffer.from("RIFF0000WEBP" )).mimeType,
    "image/webp",
  );
  assert.equal(detectImage(Buffer.from("not an image")), null);
});

test("API response helpers keep one envelope and allow endpoint metadata", () => {
  const req = { requestId: "request-1" };
  const res = {
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  success(req, res, { id: "item-1" }, 201, { serverNow: "now" });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    data: { id: "item-1" },
    meta: { requestId: "request-1", serverNow: "now" },
  });

  failure(req, res, 404, "NOT_FOUND", "Không tìm thấy.");
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: { code: "NOT_FOUND", message: "Không tìm thấy.", retryable: false },
    meta: { requestId: "request-1" },
  });
});

test("listing reports validate reasons, evidence IDs, and reject client-supplied identity", () => {
  const listingId = new mongoose.Types.ObjectId().toString();
  const evidenceId = new mongoose.Types.ObjectId().toString();

  assert.deepEqual(readListingReport({
    listingId,
    reasonCode: "OTHER",
    details: "  Nội dung cần kiểm tra. ",
    evidenceMediaIds: [evidenceId],
  }), {
    listingId,
    reasonCode: "OTHER",
    details: "Nội dung cần kiểm tra.",
    evidenceMediaIds: [evidenceId],
  });
  assert.equal(readListingReport({ listingId, reasonCode: "OTHER" }), null);
  assert.equal(readListingReport({ listingId, reasonCode: "SUSPECTED_SCAM", reporterId: "forged" }), null);
  assert.equal(readListingReport({
    listingId,
    reasonCode: "SUSPECTED_SCAM",
    evidenceMediaIds: [evidenceId, evidenceId],
  }), null);
});

test("case decisions enforce status, summary, and compatible listing actions", () => {
  assert.deepEqual(readCaseDecision({ status: "IN_REVIEW" }), { status: "IN_REVIEW" });
  assert.equal(readCaseDecision({ status: "IN_REVIEW", internalNote: "extra" }), null);
  assert.deepEqual(readCaseDecision({
    status: "CLOSED",
    outcomeCode: "CORRECTION_REQUIRED",
    outcomeSummary: "Đã yêu cầu Seller sửa ảnh.",
  }), {
    status: "CLOSED",
    outcomeCode: "CORRECTION_REQUIRED",
    outcomeSummary: "Đã yêu cầu Seller sửa ảnh.",
    internalNote: "",
    listingAction: undefined,
  });
  assert.equal(readCaseDecision({ status: "CLOSED", outcomeCode: "OTHER" }), null);
  assert.equal(readCaseDecision({
    status: "CLOSED",
    outcomeCode: "CORRECTION_REQUIRED",
    outcomeSummary: "Đã xử lý.",
    listingAction: "SHOW",
  }), null);
});

test("discovery filters validate paging and escape literal search text", () => {
  const query = readDiscoveryQuery({
    q: "áo.*",
    category: "Áo",
    size: "M",
    minPrice: "20000",
    maxPrice: "500000",
    page: "2",
    limit: "10",
  });

  assert.equal(query.page, 2);
  assert.equal(query.limit, 10);
  assert.deepEqual(query.filters["approvedVersion.price"], { $gte: 20000, $lte: 500000 });
  assert.equal(query.filters.$or[0]["approvedVersion.title"].$regex, "áo\\.\\*");
  assert.equal(readDiscoveryQuery({ minPrice: "500000", maxPrice: "20000" }), null);
  assert.equal(readDiscoveryQuery({ page: "1", unknown: "x" }), null);
});
