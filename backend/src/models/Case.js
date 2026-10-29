const mongoose = require("mongoose");

const decisionSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fromStatus: { type: String, enum: ["OPEN", "IN_REVIEW"], required: true },
    toStatus: { type: String, enum: ["IN_REVIEW", "CLOSED"], required: true },
    outcomeCode: {
      type: String,
      enum: ["", "NO_ACTION", "CORRECTION_REQUIRED", "LISTING_HIDDEN", "OTHER"],
      default: "",
    },
    outcomeSummary: { type: String, default: "", trim: true },
    internalNote: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const caseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["REPORT", "DELIVERY", "ITEM"], required: true },
    targetType: { type: String, enum: ["LISTING", "ORDER"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ["OPEN", "IN_REVIEW", "CLOSED"], default: "OPEN" },
    // Set while OPEN/IN_REVIEW and unset on close to enforce one active case per target.
    activeTargetKey: { type: String, select: false },
    assignedSupportId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    evidenceMediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
    outcomeCode: { type: String, default: "" },
    outcomeSummary: { type: String, default: "", trim: true },
    closedAt: { type: Date, default: null },
    decisions: { type: [decisionSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

caseSchema.pre("validate", function () {
  if (this.type === "REPORT" && this.targetType !== "LISTING") {
    this.invalidate("targetType", "A REPORT case must target a listing.");
  }
  if (["DELIVERY", "ITEM"].includes(this.type) && this.targetType !== "ORDER") {
    this.invalidate("targetType", "An order complaint must target an order.");
  }
  if (this.status === "CLOSED" && (
    !this.outcomeCode ||
    typeof this.outcomeSummary !== "string" ||
    !this.outcomeSummary.trim() ||
    !this.closedAt
  )) {
    this.invalidate("outcomeSummary", "A closed case requires an outcome, summary, and close time.");
  }

  this.activeTargetKey = this.status === "CLOSED"
    ? undefined
    : `${this.targetType}:${this.targetId}`;
});

caseSchema.index(
  { activeTargetKey: 1 },
  { unique: true, sparse: true, name: "one_active_case_per_target" },
);
caseSchema.index({ type: 1, status: 1, updatedAt: -1 });
caseSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
caseSchema.index({ assignedSupportId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("Case", caseSchema);
