const mongoose = require("mongoose");

const listingNotificationTypes = new Set([
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "LISTING_CORRECTION_REQUIRED",
  "LISTING_HIDDEN",
  "LISTING_SHOWN",
  "REPORT_RECEIVED",
]);

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "LISTING_APPROVED",
        "LISTING_REJECTED",
        "LISTING_CORRECTION_REQUIRED",
        "LISTING_HIDDEN",
        "LISTING_SHOWN",
        "REPORT_RECEIVED",
        "COMPLAINT_RECEIVED",
        "CASE_CLOSED",
      ],
      required: true,
    },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    versionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report", default: null },
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", default: null },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
    dedupeKey: { type: String, default: null },
    message: { type: String, required: true, trim: true },
    reason: { type: String, default: "", trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.pre("validate", function validateTarget() {
  if (listingNotificationTypes.has(this.type) && !this.listingId) {
    this.invalidate("listingId", "Listing notifications require a listing ID.");
  }
  if (this.type === "COMPLAINT_RECEIVED" && (!this.orderId || !this.complaintId || !this.caseId)) {
    this.invalidate("complaintId", "Complaint notifications require order, complaint, and case IDs.");
  }
  if (this.type === "CASE_CLOSED" && (!this.caseId || Boolean(this.listingId) === Boolean(this.orderId))) {
    this.invalidate("caseId", "Case notifications require exactly one listing or order target.");
  }
});

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    name: "notification_dedupe_key",
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);

module.exports = mongoose.model("Notification", notificationSchema);
