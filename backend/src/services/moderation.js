const AuditEvent = require("../models/AuditEvent");
const Notification = require("../models/Notification");
const { listingBlockReasons, problem } = require("../domain/commerceRules");

function adminListingState(listing) {
  const blockedReasons = listingBlockReasons(listing);
  return {
    listingId: String(listing._id),
    adminHidden: listing.adminHidden,
    adminHiddenReason: listing.adminHiddenReason,
    sellerHidden: listing.sellerHidden,
    saleStatus: listing.saleStatus,
    canBuy: blockedReasons.length === 0,
    blockedReasons,
  };
}

async function applyAdminVisibility({
  listing,
  action,
  reason,
  requireCorrection = false,
  actorId,
  requestId,
  caseId = null,
  session,
}) {
  const before = listing.adminHidden;
  if (action === "SHOW" && !before) return adminListingState(listing);

  if (action === "HIDE" && requireCorrection) {
    const hasPendingVersion = listing.versions.some((version) => version.status === "PENDING");
    if (listing.saleStatus === "SOLD") {
      throw problem(409, "LISTING_SOLD", "Không thể yêu cầu sửa tin đã bán.");
    }
    if (hasPendingVersion) {
      throw problem(
        409,
        "REVISION_PENDING",
        "Tin đã có phiên bản chờ duyệt; hãy quyết định phiên bản đó trước.",
      );
    }
  }

  if (action === "SHOW") {
    const blockers = listingBlockReasons(listing).filter(
      (code) => !["ADMIN_HIDDEN", "SELLER_HIDDEN"].includes(code),
    );
    if (blockers.length) {
      throw problem(409, "LISTING_UNAVAILABLE", "Tin chưa đủ điều kiện để gỡ ẩn của Admin.");
    }
    listing.adminHidden = false;
    listing.adminHiddenReason = "";
  } else {
    listing.adminHidden = true;
    listing.adminHiddenReason = reason;
    if (requireCorrection) {
      listing.correctionRequested = true;
      listing.correctionReason = reason;
      listing.reviewHold = true;
    }
  }

  await listing.save({ session });
  await AuditEvent.create(
    [{
      actorId,
      action: action === "HIDE" ? "LISTING_ADMIN_HIDDEN" : "LISTING_ADMIN_SHOWN",
      targetType: "LISTING",
      targetId: listing._id,
      requestId,
      reason,
      fromState: String(before),
      toState: String(listing.adminHidden),
      caseId,
    }],
    { session },
  );
  await Notification.create(
    [{
      recipientId: listing.ownerId,
      type: action === "HIDE"
        ? requireCorrection
          ? "LISTING_CORRECTION_REQUIRED"
          : "LISTING_HIDDEN"
        : "LISTING_SHOWN",
      listingId: listing._id,
      versionId: listing.approvedVersionId,
      message: action === "HIDE"
        ? requireCorrection
          ? "Quản trị viên yêu cầu bạn chỉnh sửa tin trước khi gửi lại."
          : "Tin của bạn đã bị ẩn bởi quản trị viên."
        : "Cờ ẩn do quản trị viên đặt đã được gỡ.",
      reason,
    }],
    { session },
  );

  return adminListingState(listing);
}

module.exports = { applyAdminVisibility, adminListingState };
