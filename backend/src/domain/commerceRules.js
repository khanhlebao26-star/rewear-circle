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
    listing.sellerHidden ||
    listing.adminHidden
  ) {
    return null;
  }

  const version = listing.versions.id(listing.approvedVersionId);
  return version?.status === "APPROVED" ? version : null;
}

function approvedVisibleListingQuery(extra = {}) {
  return {
    ...extra,
    approvedVersionId: extra.approvedVersionId ?? { $ne: null },
    reviewHold: false,
    sellerHidden: false,
    adminHidden: false,
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
    price: version.price,
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

module.exports = {
  problem,
  validId,
  approvedVersion,
  approvedVisibleListingQuery,
  snapshot,
  availableStates,
  sameSelection,
  readAddress,
};
