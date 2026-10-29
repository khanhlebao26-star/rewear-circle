const mongoose = require("mongoose");

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
        "CASE_CLOSED",
      ],
      required: true,
    },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report", default: null },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
    message: { type: String, required: true, trim: true },
    reason: { type: String, default: "", trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
