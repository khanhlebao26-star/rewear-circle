const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reasonCode: {
      type: String,
      enum: [
        "INACCURATE_OR_INCOMPLETE",
        "SUSPECTED_COUNTERFEIT",
        "PROHIBITED_OR_INAPPROPRIATE",
        "OFFENSIVE_CONTENT",
        "DUPLICATE_OR_SPAM",
        "SUSPECTED_SCAM",
        "OTHER",
      ],
      required: true,
    },
    details: { type: String, default: "", trim: true },
    contentRedacted: { type: Boolean, default: false },
    contentRedactedAt: { type: Date, default: null },
    evidenceMediaIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
      default: [],
      validate: [
        (ids) => ids.length <= 5 && new Set(ids.map(String)).size === ids.length,
        "A report may include up to five unique evidence images.",
      ],
    },
  },
  { timestamps: true },
);

reportSchema.pre("validate", function () {
  if (this.reasonCode === "OTHER" && !this.details.trim()) {
    this.invalidate("details", "Details are required for an OTHER report.");
  }
});

reportSchema.index({ caseId: 1, createdAt: 1 });
reportSchema.index({ listingId: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
