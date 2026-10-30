function problem(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function validId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function approvedVersion(listing) {
  if (
    !listing ||
    listing.reviewHold ||
    listing.correctionRequested ||
    listing.sellerHidden ||
    listing.adminHidden ||
    listing.paymentReviewHold
  ) {
    return null;
  }

  const version = listing.versions.id(listing.approvedVersionId);
  return version?.status === "APPROVED" ? version : null;
}

function listingBlockReasons(listing) {
  const reasons = [];
  const version = listing?.versions.id(listing.approvedVersionId);

  if (version?.status !== "APPROVED") reasons.push("NOT_APPROVED");
  if (listing.reviewHold) reasons.push("REVIEW_HOLD");
  if (listing.correctionRequested) reasons.push("CORRECTION_REQUIRED");
  if (listing.sellerHidden) reasons.push("SELLER_HIDDEN");
  if (listing.adminHidden) reasons.push("ADMIN_HIDDEN");
  if (listing.paymentReviewHold) reasons.push("PAYMENT_REVIEW");
  if (listing.saleStatus !== "AVAILABLE") reasons.push(`SALE_${listing.saleStatus}`);

  return reasons;
}

function approvedVisibleListingQuery(extra = {}) {
  return {
    ...extra,
    approvedVersionId: extra.approvedVersionId ?? { $ne: null },
    reviewHold: false,
    correctionRequested: { $ne: true },
    sellerHidden: false,
    adminHidden: false,
    paymentReviewHold: { $ne: true },
  };
}

function snapshot(listing) {
  const version = approvedVersion(listing);

  if (!version) {
    throw problem(
      409,
      "LISTING_UNAVAILABLE",
      "Tin không còn đủ điều kiện mua.",
    );
  }

  return {
    listingId: listing._id,
    versionId: version._id,
    sellerId: listing.ownerId,
    title: version.title,
    category: version.category,
    size: version.size,
    condition: version.condition,
    description: version.description,
    flaws: version.flaws,
    price: version.price,
    shipFrom: version.shipFrom,
    imageIds: version.imageIds,
  };
}

function availableStates(now) {
  return [
    { saleStatus: "AVAILABLE" },
    {
      saleStatus: "RESERVED",
      reservedUntil: { $lte: now },
    },
  ];
}

function sameSelection(checkout, ids) {
  const saved = checkout.items.map((item) => String(item.listingId)).sort();

  if (saved.join(",") !== ids.join(",")) {
    throw problem(
      409,
      "REQUEST_KEY_REUSED",
      "requestKey đã được dùng cho danh sách món khác.",
    );
  }
}

function readAddress(value) {
  const result = {
    fullName: typeof value?.fullName === "string" ? value.fullName.trim() : "",
    phone: typeof value?.phone === "string" ? value.phone.trim() : "",
    address: typeof value?.address === "string" ? value.address.trim() : "",
  };

  if (
    result.fullName.length < 2 ||
    result.fullName.length > 100 ||
    !/^\+?\d{9,15}$/.test(result.phone) ||
    result.address.length < 10 ||
    result.address.length > 500
  ) {
    throw problem(
      422,
      "INVALID_ADDRESS",
      "Tên, số điện thoại hoặc địa chỉ không hợp lệ.",
    );
  }

  return result;
}

function paymentReadyToShip(order) {
  return order.paymentMethod === "COD" && order.status === "CONFIRMED" && order.paymentStatus === "UNPAID";
}

function paymentReadyToReceive(order) {
  return order.paymentMethod === "COD" && order.status === "CONFIRMED" &&
    ["UNPAID", "COLLECTED"].includes(order.paymentStatus);
}

module.exports = {
  problem,
  validId,
  approvedVersion,
  listingBlockReasons,
  approvedVisibleListingQuery,
  snapshot,
  availableStates,
  sameSelection,
  readAddress,
  paymentReadyToShip,
  paymentReadyToReceive,
};
