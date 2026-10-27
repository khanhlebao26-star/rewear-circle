const mongoose = require("mongoose");

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const itemSchema = new Schema(
  {
    listingId: { type: ObjectId, required: true },
    versionId: { type: ObjectId, required: true },
    sellerId: { type: ObjectId, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    imageIds: [{ type: ObjectId, ref: "Media" }],
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
    buyerId: { type: ObjectId, ref: "User", required: true },
    requestKey: { type: String, required: true },
    items: { type: [itemSchema], required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["OPEN", "COMPLETED", "CANCELLED", "EXPIRED"],
      default: "OPEN",
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

checkoutSchema.index({ buyerId: 1, requestKey: 1 }, { unique: true });
checkoutSchema.index({ status: 1, expiresAt: 1 });

const addressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    checkoutId: { type: ObjectId, ref: "Checkout", required: true },
    buyerId: { type: ObjectId, ref: "User", required: true },
    sellerId: { type: ObjectId, ref: "User", required: true },
    items: { type: [itemSchema], required: true },
    shippingAddress: { type: addressSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, default: "PLACED" },
    paymentMethod: { type: String, default: "COD" },
    paymentStatus: { type: String, default: "UNPAID" },
  },
  { timestamps: true },
);

orderSchema.index({ checkoutId: 1, sellerId: 1 }, { unique: true });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = {
  Cart: mongoose.model("Cart", cartSchema),
  Checkout: mongoose.model("Checkout", checkoutSchema),
  Order: mongoose.model("Order", orderSchema),
};
