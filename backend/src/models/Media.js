const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    purpose: { type: String, enum: ["LISTING", "CASE_EVIDENCE"], default: "LISTING" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Media", mediaSchema);
