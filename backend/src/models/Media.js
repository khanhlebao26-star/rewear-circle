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
    purpose: { type: String, enum: ["LISTING", "CASE_EVIDENCE", "RETENTION_PENDING"], default: "LISTING" },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
  },
  { timestamps: true },
);

mediaSchema.index(
  { caseId: 1, createdAt: -1 },
  { name: "case_media_by_case", partialFilterExpression: { caseId: { $type: "objectId" } } },
);

module.exports = mongoose.model("Media", mediaSchema);
