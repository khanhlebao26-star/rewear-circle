const mongoose = require("mongoose");

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const VND = "VND";

function moneyField({ required = false, min = 0, defaultValue } = {}) {
  return {
    type: Number,
    min,
    validate: {
      validator: (value) => value == null || Number.isSafeInteger(value),
      message: "VND amounts must be safe whole numbers.",
    },
    ...(required ? { required: true } : {}),
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
  };
}

const snapshotFields = {
  listingId: { type: ObjectId, ref: "Listing", required: true, immutable: true },
  versionId: { type: ObjectId, required: true, immutable: true },
  sellerId: { type: ObjectId, ref: "User", required: true, immutable: true },
  title: { type: String, required: true, immutable: true },
  category: { type: String, default: "", immutable: true },
  size: { type: String, default: "", immutable: true },
  condition: { type: String, default: "", immutable: true },
  description: { type: String, default: "", immutable: true },
  flaws: { type: String, default: "", immutable: true },
  price: { ...moneyField({ required: true }), immutable: true },
  shipFrom: { type: String, default: "", immutable: true },
  imageIds: { type: [{ type: ObjectId, ref: "Media" }], immutable: true },
};

const checkoutItemSchema = new Schema(snapshotFields, { _id: false });
const orderItemSchema = new Schema({
  ...snapshotFields,
  quantity: { type: Number, enum: [1], default: 1, immutable: true },
});

const addressSchema = new Schema(
  {
    fullName: { type: String, required: true, immutable: true },
    phone: { type: String, required: true, immutable: true },
    address: { type: String, required: true, immutable: true },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    buyerId: {
      type: ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    listingIds: {
      type: [{ type: ObjectId, ref: "Listing" }],
      default: [],
    },
  },
  { timestamps: true },
);

const checkoutSchema = new Schema(
  {
    buyerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    // Kept as the persisted key during the API migration; new routes read it from Idempotency-Key.
    requestKey: { type: String, required: true, immutable: true },
    idempotencyFingerprint: { type: String, default: "" },
    contractVersion: { type: Number, enum: [1, 2], default: 1 },
    items: { type: [checkoutItemSchema], required: true, immutable: true },
    paymentMethod: { type: String, enum: ["VNPAY", "COD"], default: null, immutable: true },
    paymentStatus: {
      type: String,
      enum: [
        "PENDING",
        "PAID",
        "PAYMENT_FAILED",
        "EXPIRED",
        "UNPAID",
        "PARTIALLY_COLLECTED",
        "COLLECTED",
        "NOT_DUE",
        "NEEDS_REVIEW",
        "CANCELLED",
      ],
      default: null,
    },
    currency: { type: String, enum: [VND], default: VND, immutable: true },
    subtotal: { ...moneyField({ defaultValue: null }), immutable: true },
    shippingFee: { ...moneyField({ defaultValue: 0 }), immutable: true },
    total: { ...moneyField({ defaultValue: null }), immutable: true },
    collectibleAmount: moneyField({ defaultValue: null }),
    collectedAmount: moneyField({ defaultValue: null }),
    outstandingAmount: moneyField({ defaultValue: null }),
    shippingAddress: { type: addressSchema, default: null, immutable: true },
    expiresAt: { type: Date, default: null, immutable: true },
    paymentAttemptId: { type: ObjectId, ref: "PaymentAttempt", default: null },
    status: {
      type: String,
      enum: [
        "OPEN",
        "COMPLETED",
        "PENDING_PAYMENT",
        "PAID",
        "PAYMENT_FAILED",
        "EXPIRED",
        "CANCELLED",
        "CONFIRMED",
        "NEEDS_REVIEW",
      ],
      default: "OPEN",
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

checkoutSchema.pre("validate", function validatePaymentContract() {
  if (this.contractVersion < 2) return;

  if (!this.paymentMethod) {
    this.invalidate("paymentMethod", "Contract version 2 requires a payment method.");
  }
  if (this.status === "OPEN") {
    this.invalidate("status", "Contract version 2 requires an explicit checkout state.");
  }
  if (!this.idempotencyFingerprint) {
    this.invalidate("idempotencyFingerprint", "Contract version 2 requires an idempotency fingerprint.");
  }
  if (!this.shippingAddress) {
    this.invalidate("shippingAddress", "Contract version 2 requires a shipping address snapshot.");
  }
  if (this.subtotal == null || this.total == null || this.paymentStatus == null) {
    this.invalidate("total", "Contract version 2 requires totals and payment status.");
  }
  if (this.paymentMethod === "VNPAY" && !this.expiresAt) {
    this.invalidate("expiresAt", "VNPAY checkouts require a reservation expiry.");
  }
  if (this.paymentMethod === "COD" && this.expiresAt) {
    this.invalidate("expiresAt", "COD checkouts do not expire automatically.");
  }
  if (this.paymentMethod === "COD" && this.paymentAttemptId) {
    this.invalidate("paymentAttemptId", "COD checkouts cannot have a VNPAY payment attempt.");
  }
  if (
    this.subtotal != null &&
    this.total != null &&
    this.total !== this.subtotal + (this.shippingFee || 0)
  ) {
    this.invalidate("total", "Checkout total must equal subtotal plus shipping fee.");
  }
});

checkoutSchema.index({ buyerId: 1, requestKey: 1 }, { unique: true });
checkoutSchema.index({ status: 1, expiresAt: 1 });
checkoutSchema.index({ paymentMethod: 1, status: 1, expiresAt: 1 });

const orderSchema = new Schema(
  {
    checkoutId: { type: ObjectId, ref: "Checkout", required: true, immutable: true },
    buyerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    sellerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    items: { type: [orderItemSchema], required: true, immutable: true },
    shippingAddress: { type: addressSchema, required: true, immutable: true },
    currency: { type: String, enum: [VND], default: VND, immutable: true },
    subtotal: { ...moneyField({ required: true }), immutable: true },
    shippingFee: { ...moneyField({ required: true }), immutable: true },
    total: { ...moneyField({ required: true }), immutable: true },
    contractVersion: { type: Number, enum: [1, 2], default: 1 },
    carrierName: { type: String, default: "", trim: true },
    trackingCode: { type: String, default: "", trim: true },
    shippedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        "PLACED",
        "PENDING",
        "CONFIRMED",
        "PAID",
        "PAYMENT_FAILED",
        "EXPIRED",
        "CANCELLED",
        "NEEDS_REVIEW",
        "RETURNED",
        "COMPLETED",
      ],
      default: "PLACED",
    },
    paymentMethod: { type: String, enum: ["VNPAY", "COD"], default: null, immutable: true },
    paymentStatus: {
      type: String,
      enum: [
        "PENDING",
        "PAID",
        "PAYMENT_FAILED",
        "EXPIRED",
        "UNPAID",
        "COLLECTED",
        "NOT_DUE",
        "NEEDS_REVIEW",
        "CANCELLED",
      ],
      default: null,
    },
    codCollectionId: { type: ObjectId, ref: "CodCollection", default: null },
    codReturnRequestId: { type: ObjectId, ref: "CodReturnRequest", default: null },
    paymentReviewHold: { type: Boolean, default: false },
    paymentReviewReason: { type: String, default: "", maxlength: 120 },
  },
  { timestamps: true },
);

orderSchema.pre("validate", function validatePaymentContract() {
  if (this.contractVersion < 2) {
    if (!this.paymentMethod) this.paymentMethod = "COD";
    if (!this.paymentStatus) this.paymentStatus = "UNPAID";
    return;
  }
  if (!this.paymentMethod) {
    this.invalidate("paymentMethod", "Contract version 2 requires a payment method.");
  }
  if (this.status === "PLACED") {
    this.invalidate("status", "Contract version 2 requires an explicit order state.");
  }
  if (!this.paymentStatus) {
    this.invalidate("paymentStatus", "Contract version 2 requires an explicit payment state.");
  }
});

orderSchema.index({ checkoutId: 1, sellerId: 1 }, { unique: true });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, status: 1, createdAt: -1 });

const reconciliationSchema = new Schema(
  {
    nextAt: { type: Date, default: null },
    checkpoint: {
      type: String,
      enum: ["EXPIRY", "PLUS_1_MIN", "PLUS_3_MIN", "PLUS_5_MIN", "NEEDS_REVIEW"],
      default: null,
    },
    requestCount: { type: Number, min: 0, default: 0 },
    lastRequestedAt: { type: Date, default: null },
    lastResponseAt: { type: Date, default: null },
    lastResponseCode: { type: String, default: "" },
    lastTransactionStatus: { type: String, default: "" },
    leaseId: { type: String, default: "" },
    leaseUntil: { type: Date, default: null },
  },
  { _id: false },
);

const paymentAttemptSchema = new Schema(
  {
    checkoutId: { type: ObjectId, ref: "Checkout", required: true },
    buyerId: { type: ObjectId, ref: "User", required: true },
    provider: { type: String, enum: ["VNPAY"], required: true },
    merchantReference: { type: String, required: true },
    paymentUrl: { type: String, default: "", select: false },
    providerTransactionNo: { type: String, default: "" },
    amount: moneyField({ required: true, min: 1 }),
    currency: { type: String, enum: [VND], required: true, default: VND },
    status: {
      type: String,
      enum: ["INITIATED", "PENDING", "SUCCESS", "FAILED", "EXPIRED", "NEEDS_REVIEW"],
      required: true,
      default: "INITIATED",
    },
    idempotencyKey: { type: String, required: true },
    idempotencyFingerprint: { type: String, required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    urlCreatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
    responseCode: { type: String, default: "" },
    transactionStatus: { type: String, default: "" },
    reconciliation: { type: reconciliationSchema, default: () => ({}) },
  },
  { timestamps: true },
);

paymentAttemptSchema.index({ checkoutId: 1 }, { unique: true });
paymentAttemptSchema.index({ merchantReference: 1 }, { unique: true });
paymentAttemptSchema.index({ buyerId: 1, idempotencyKey: 1 }, { unique: true });
paymentAttemptSchema.index({ status: 1, "reconciliation.nextAt": 1, "reconciliation.leaseUntil": 1 });
paymentAttemptSchema.index({ providerTransactionNo: 1 }, { sparse: true });

const paymentEventSchema = new Schema(
  {
    paymentAttemptId: { type: ObjectId, ref: "PaymentAttempt", default: null },
    source: { type: String, enum: ["IPN", "QUERY"], required: true },
    eventKey: { type: String, required: true },
    requestId: { type: String, default: "" },
    providerRequestId: { type: String },
    providerResponseId: { type: String, default: "" },
    merchantReference: { type: String, default: "" },
    providerTransactionNo: { type: String, default: "" },
    signatureStatus: { type: String, enum: ["VALID", "INVALID", "NOT_CHECKED"], required: true },
    merchantMatched: { type: Boolean, default: false },
    referenceMatched: { type: Boolean, default: false },
    amountMatched: { type: Boolean, default: false },
    expectedAmount: moneyField({ defaultValue: null }),
    receivedAmount: moneyField({ defaultValue: null }),
    currency: { type: String, enum: [VND], default: VND },
    responseCode: { type: String, default: "" },
    transactionStatus: { type: String, default: "" },
    payloadHash: { type: String, default: "" },
    decision: {
      type: String,
      enum: ["APPLIED", "DUPLICATE", "IGNORED", "NEEDS_REVIEW", "REJECTED"],
      required: true,
    },
    reasonCode: { type: String, default: "" },
    receivedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentEventSchema.index({ eventKey: 1 }, { unique: true });
paymentEventSchema.index({ paymentAttemptId: 1, receivedAt: -1 });
paymentEventSchema.index({ merchantReference: 1, receivedAt: -1 });
paymentEventSchema.index(
  { providerRequestId: 1 },
  { unique: true, sparse: true },
);

const codCollectionSchema = new Schema(
  {
    orderId: { type: ObjectId, ref: "Order", required: true },
    buyerId: { type: ObjectId, ref: "User", required: true },
    sellerId: { type: ObjectId, ref: "User", required: true },
    amount: moneyField({ required: true, min: 1 }),
    currency: { type: String, enum: [VND], required: true, default: VND },
    source: { type: String, enum: ["SELLER_DECLARATION"], required: true, default: "SELLER_DECLARATION" },
    recordedAt: { type: Date, required: true, default: Date.now },
    requestId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    idempotencyFingerprint: { type: String, required: true },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true },
);

codCollectionSchema.index({ orderId: 1 }, { unique: true });
codCollectionSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true });

const codReturnRequestSchema = new Schema(
  {
    orderId: { type: ObjectId, ref: "Order", required: true },
    buyerId: { type: ObjectId, ref: "User", required: true },
    sellerId: { type: ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    idempotencyFingerprint: { type: String, required: true },
    reason: { type: String, required: true, minlength: 10, maxlength: 2000, trim: true },
    trackingCode: { type: String, required: true },
    status: { type: String, enum: ["OPEN", "ACCEPTED", "REJECTED"], default: "OPEN" },
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decisionReason: { type: String, default: "", maxlength: 2000, trim: true },
    decidedAt: { type: Date, default: null },
    decisionIdempotencyKey: { type: String },
    decisionFingerprint: { type: String, default: "" },
  },
  { timestamps: true },
);

codReturnRequestSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } },
);

codReturnRequestSchema.pre("validate", function validateDecision() {
  if (this.status === "OPEN") return;
  if (!this.decidedBy) this.invalidate("decidedBy", "A closed return request requires an Admin.");
  if (!this.decidedAt) this.invalidate("decidedAt", "A closed return request requires a decision time.");
  if (!this.decisionReason?.trim()) {
    this.invalidate("decisionReason", "A closed return request requires a reason.");
  }
  if (!this.decisionIdempotencyKey) {
    this.invalidate("decisionIdempotencyKey", "A closed return request requires an idempotency key.");
  }
  if (!this.decisionFingerprint) {
    this.invalidate("decisionFingerprint", "A closed return request requires an idempotency fingerprint.");
  }
});
codReturnRequestSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true });
codReturnRequestSchema.index({ status: 1, createdAt: -1 });
codReturnRequestSchema.index(
  { decidedBy: 1, decisionIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { decisionIdempotencyKey: { $type: "string" } },
  },
);

module.exports = {
  Cart: mongoose.model("Cart", cartSchema),
  Checkout: mongoose.model("Checkout", checkoutSchema),
  Order: mongoose.model("Order", orderSchema),
  PaymentAttempt: mongoose.model("PaymentAttempt", paymentAttemptSchema),
  PaymentEvent: mongoose.model("PaymentEvent", paymentEventSchema),
  CodCollection: mongoose.model("CodCollection", codCollectionSchema),
  CodReturnRequest: mongoose.model("CodReturnRequest", codReturnRequestSchema),
};
