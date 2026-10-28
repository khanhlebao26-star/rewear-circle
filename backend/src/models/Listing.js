const mongoose = require("mongoose");

const versionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  size: { type: String, required: true },
  condition: { type: String, required: true },
  description: { type: String, required: true },
  flaws: { type: String, default: "" },
  price: { type: Number, required: true },
  shipFrom: { type: String, required: true },
  imageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING",
  },
  submittedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: "", trim: true },
});

const listingSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    versions: {
      type: [versionSchema],
      default: [],
      validate: {
        validator: (versions) => versions.filter(({ status }) => status === "PENDING").length <= 1,
        message: "A listing can have only one pending version.",
      },
    },
    approvedVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewHold: { type: Boolean, default: true },
    correctionRequested: { type: Boolean, default: false },
    correctionReason: { type: String, default: "", trim: true },
    resubmissionCount: { type: Number, min: 0, default: 0 },
    paymentReviewHold: { type: Boolean, default: false },
    saleStatus: {
      type: String,
      enum: ["AVAILABLE", "RESERVED", "SOLD"],
      default: "AVAILABLE",
    },
    reservedCheckoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Checkout",
      default: null,
    },
    reservedUntil: {
      type: Date,
      default: null,
    },
    soldCheckoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Checkout",
      default: null,
    },
    paymentReviewCheckoutIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Checkout",
    }],
    sellerHidden: { type: Boolean, default: false },
    adminHidden: { type: Boolean, default: false },
    adminHiddenReason: { type: String, default: "", trim: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

listingSchema.index({ ownerId: 1, createdAt: -1 });
listingSchema.index({ "versions.status": 1, "versions.submittedAt": -1 });
listingSchema.index({ saleStatus: 1, reservedUntil: 1 });
listingSchema.index({ paymentReviewCheckoutIds: 1 });

module.exports = mongoose.model("Listing", listingSchema);
