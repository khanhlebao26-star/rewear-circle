const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ["USER", "PROVIDER", "SYSTEM"], default: "USER" },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: {
      type: String,
      enum: [
        "LISTING_APPROVED",
        "LISTING_REJECTED",
        "LISTING_SELLER_HIDDEN",
        "LISTING_SELLER_SHOWN",
        "LISTING_ADMIN_HIDDEN",
        "LISTING_ADMIN_SHOWN",
        "REPORT_CREATED",
        "CASE_REVIEW_STARTED",
        "CASE_ASSIGNED",
        "CASE_CLOSED",
        "CASE_EVIDENCE_READ",
        "CASE_CONTACT_ACCESS_READ",
        "CHECKOUT_CREATED",
        "ORDER_CREATED",
        "ORDER_SHIPPED",
        "ORDER_RECEIVED",
        "CHECKOUT_CANCELLED",
        "ORDER_CANCELLED",
        "CHECKOUT_EXPIRED",
        "PAYMENT_ATTEMPT_CREATED",
        "PAYMENT_RESULT_RECEIVED",
        "PAYMENT_RESULT_APPLIED",
        "PAYMENT_RESULT_IGNORED",
        "PAYMENT_RECONCILIATION_REQUESTED",
        "PAYMENT_NEEDS_REVIEW",
        "PAYMENT_LOOKUP_READ",
        "PAYMENT_DETAIL_READ",
        "COD_ORDER_CANCELLED",
        "COD_COLLECTION_RECORDED",
        "COD_COLLECTION_LOOKUP_READ",
        "COD_RETURN_REQUESTED",
        "COD_RETURN_LOOKUP_READ",
        "COD_RETURN_ACCEPTED",
        "COD_RETURN_REJECTED",
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: [
        "LISTING",
        "LISTING_VERSION",
        "REPORT",
        "CASE",
        "MEDIA",
        "CHECKOUT",
        "ORDER",
        "PAYMENT_ATTEMPT",
        "PAYMENT_EVENT",
        "COD_COLLECTION",
        "COD_RETURN_REQUEST",
      ],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    requestId: { type: String, required: true },
    reason: { type: String, default: "", trim: true },
    fromState: { type: String, default: "" },
    toState: { type: String, default: "" },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditEventSchema.pre("validate", function validateActor() {
  if (this.actorType === "USER" && !this.actorId) {
    this.invalidate("actorId", "USER audit events require an actor ID.");
  }
  if (this.actorType !== "USER" && this.actorId) {
    this.invalidate("actorId", "PROVIDER and SYSTEM audit events cannot impersonate a user.");
  }
});

auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditEvent", auditEventSchema);
