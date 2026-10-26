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
});

const listingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    versions: { type: [versionSchema], default: [] },
    approvedVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewHold: { type: Boolean, default: true },
    saleStatus: {
      type: String,
      enum: ["AVAILABLE", "RESERVED", "SOLD"],
      default: "AVAILABLE",
    },
    sellerHidden: { type: Boolean, default: false },
    adminHidden: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true },
);

module.exports = mongoose.model("Listing", listingSchema);
