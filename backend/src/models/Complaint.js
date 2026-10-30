const mongoose = require("mongoose");

const deliveryReasons = [
  "SELLER_NOT_SHIPPED",
  "NOT_RECEIVED",
  "DELIVERY_DELAYED",
  "OTHER",
];
const itemReasons = [
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "MISSING_ACCESSORIES",
  "SUSPECTED_COUNTERFEIT",
  "DAMAGED_ON_ARRIVAL",
  "OTHER",
];
const allReasons = [...new Set([...deliveryReasons, ...itemReasons])];

const itemSnapshotSchema = new mongoose.Schema(
  {
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    category: { type: String, default: "" },
    size: { type: String, default: "" },
    condition: { type: String, default: "" },
    description: { type: String, default: "" },
    flaws: { type: String, default: "" },
    price: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    quantity: { type: Number, enum: [1], default: 1 },
    imageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
  },
  { _id: false },
);

const complaintSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", required: true, immutable: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
    checkoutId: { type: mongoose.Schema.Types.ObjectId, ref: "Checkout", required: true, immutable: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    type: { type: String, enum: ["DELIVERY", "ITEM"], required: true, immutable: true },
    reasonCode: {
      type: String,
      enum: allReasons,
      required: true,
      immutable: true,
    },
    details: { type: String, required: true, minlength: 10, maxlength: 2000, trim: true, immutable: true },
    affectedOrderItemIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
      immutable: true,
      validate: [(ids) => ids.length <= 20 && new Set(ids.map(String)).size === ids.length, "Order item IDs must be unique."],
    },
    itemSnapshots: {
      type: [itemSnapshotSchema],
      required: true,
      immutable: true,
      validate: [(items) => items.length <= 20, "A complaint cannot snapshot more than 20 order items."],
    },
    orderStatusAtSubmission: {
      type: String,
      enum: ["CONFIRMED", "PAID", "COMPLETED", "NEEDS_REVIEW"],
      required: true,
      immutable: true,
    },
    paymentMethod: { type: String, enum: ["COD", "VNPAY"], required: true, immutable: true },
    paymentStatusAtSubmission: {
      type: String,
      enum: ["UNPAID", "COLLECTED", "PAID"],
      required: true,
      immutable: true,
    },
    carrierNameAtSubmission: { type: String, default: "", maxlength: 100, immutable: true },
    trackingCodeAtSubmission: { type: String, default: "", maxlength: 100, immutable: true },
    shippedAtSubmission: { type: Date, default: null, immutable: true },
    receivedAtSubmission: { type: Date, default: null, immutable: true },
    evidenceMediaIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
      default: [],
      immutable: true,
      validate: [
        (ids) => ids.length <= 5 && new Set(ids.map(String)).size === ids.length,
        "A complaint may include up to five unique evidence images.",
      ],
    },
    idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 100, match: /^[A-Za-z0-9_-]+$/, immutable: true },
    idempotencyFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  },
  { timestamps: true },
);

complaintSchema.pre("validate", function validateComplaint() {
  const reasons = this.type === "DELIVERY" ? deliveryReasons : itemReasons;
  if (!reasons.includes(this.reasonCode)) {
    this.invalidate("reasonCode", "The reason code is not valid for this complaint type.");
  }

  const itemIds = this.affectedOrderItemIds.map(String);
  const snapshotIds = this.itemSnapshots.map((item) => String(item.orderItemId));
  if (this.type === "DELIVERY" && itemIds.length) {
    this.invalidate("affectedOrderItemIds", "Delivery complaints apply to the whole order.");
  }
  if (this.type === "ITEM" && (
    itemIds.length === 0 ||
    itemIds.length !== snapshotIds.length ||
    itemIds.some((id) => !snapshotIds.includes(id))
  )) {
    this.invalidate("affectedOrderItemIds", "Item complaints require a snapshot for every affected order item.");
  }
  if (new Set(snapshotIds).size !== snapshotIds.length) {
    this.invalidate("itemSnapshots", "Order item snapshots must be unique.");
  }
  if (this.type === "DELIVERY" && snapshotIds.length === 0) {
    this.invalidate("itemSnapshots", "Delivery complaints require the order item snapshots.");
  }
  if (this.type === "DELIVERY" && this.reasonCode === "SELLER_NOT_SHIPPED" && this.shippedAtSubmission) {
    this.invalidate("reasonCode", "SELLER_NOT_SHIPPED requires an order without a shipment.");
  }
  if (this.type === "DELIVERY" && ["NOT_RECEIVED", "DELIVERY_DELAYED"].includes(this.reasonCode) && !this.shippedAtSubmission) {
    this.invalidate("reasonCode", "This delivery reason requires a shipped order.");
  }
  if (this.type === "ITEM" && !this.receivedAtSubmission) {
    this.invalidate("receivedAtSubmission", "Item complaints require a completed order with a receipt time.");
  }
  const validDeliveryState = this.paymentMethod === "VNPAY"
    ? this.orderStatusAtSubmission === "PAID" && this.paymentStatusAtSubmission === "PAID"
    : (this.orderStatusAtSubmission === "CONFIRMED" && ["UNPAID", "COLLECTED"].includes(this.paymentStatusAtSubmission)) ||
      (this.orderStatusAtSubmission === "NEEDS_REVIEW" && this.paymentStatusAtSubmission === "UNPAID");
  const validItemState = this.orderStatusAtSubmission === "COMPLETED" && (
    (this.paymentMethod === "VNPAY" && this.paymentStatusAtSubmission === "PAID") ||
    (this.paymentMethod === "COD" && ["UNPAID", "COLLECTED"].includes(this.paymentStatusAtSubmission))
  );
  if (this.type === "DELIVERY" && !validDeliveryState) {
    this.invalidate("orderStatusAtSubmission", "Delivery complaint state does not match the payment method.");
  }
  if (this.type === "DELIVERY" && this.paymentMethod === "COD" && (
    (this.orderStatusAtSubmission === "NEEDS_REVIEW" && (!this.shippedAtSubmission || this.receivedAtSubmission)) ||
    (this.paymentStatusAtSubmission === "COLLECTED" && !this.shippedAtSubmission)
  )) {
    this.invalidate("orderStatusAtSubmission", "The COD delivery exception requires a shipped, unreceived order.");
  }
  if (this.type === "ITEM" && !validItemState) {
    this.invalidate("orderStatusAtSubmission", "Item complaints require a completed, payable order.");
  }
});

complaintSchema.index({ buyerId: 1, orderId: 1, idempotencyKey: 1 }, { unique: true, name: "complaint_idempotency" });
complaintSchema.index({ caseId: 1, createdAt: -1, _id: -1 }, { name: "complaints_by_case" });
complaintSchema.index({ buyerId: 1, orderId: 1, createdAt: -1, _id: -1 }, { name: "complaints_by_buyer_order" });
complaintSchema.index({ buyerId: 1, createdAt: -1 }, { name: "complaints_by_buyer_window" });

module.exports = mongoose.model("Complaint", complaintSchema);
