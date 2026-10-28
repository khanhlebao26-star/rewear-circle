const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const { Cart, Checkout, Order } = require("../models/commerce");
const { problem, approvedVisibleListingQuery } = require("../domain/commerceRules");

async function findCheckout(checkoutId, buyerId, session) {
  const checkout = await Checkout.findOne({ _id: checkoutId, buyerId }).session(session);

  if (!checkout) throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");

  if (checkout.status === "COMPLETED") {
    return {
      checkout,
      orders: await Order.find({ checkoutId: checkout._id })
        .sort({ sellerId: 1 })
        .session(session),
    };
  }

  if (checkout.status !== "OPEN" || checkout.expiresAt <= new Date()) {
    throw problem(
      409,
      "CHECKOUT_UNAVAILABLE",
      "Checkout đã hết hạn hoặc đã hủy.",
    );
  }

  return { checkout };
}

async function markItemsSold(checkout, session) {
  const itemsBySeller = new Map();

  for (const item of checkout.items) {
    const updated = await Listing.updateOne(
      approvedVisibleListingQuery({
        _id: item.listingId,
        ownerId: item.sellerId,
        approvedVersionId: item.versionId,
        versions: {
          $elemMatch: { _id: item.versionId, status: "APPROVED" },
        },
        saleStatus: "RESERVED",
        reservedCheckoutId: checkout._id,
        reservedUntil: { $gt: new Date() },
      }),
      {
        $set: {
          saleStatus: "SOLD",
          reservedCheckoutId: null,
          reservedUntil: null,
        },
        $inc: { __v: 1 },
      },
      { session },
    );

    if (updated.modifiedCount !== 1) {
      throw problem(
        409,
        "RESERVATION_LOST",
        "Có món không còn đủ điều kiện xác nhận.",
      );
    }

    const sellerId = String(item.sellerId);
    if (!itemsBySeller.has(sellerId)) itemsBySeller.set(sellerId, []);
    itemsBySeller.get(sellerId).push(item.toObject());
  }

  return itemsBySeller;
}

async function createOrders(checkout, buyerId, shippingAddress, itemsBySeller, session) {
  const orders = [];

  for (const [sellerId, items] of itemsBySeller) {
    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const shippingFee = 0;
    const [order] = await Order.create(
      [{
        checkoutId: checkout._id,
        buyerId,
        sellerId,
        items,
        shippingAddress,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
      }],
      { session },
    );
    orders.push(order);
  }

  return orders;
}

async function completeCheckout(checkout, session) {
  const result = await Checkout.updateOne(
    {
      _id: checkout._id,
      status: "OPEN",
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: "COMPLETED" }, $inc: { __v: 1 } },
    { session },
  );

  if (result.modifiedCount !== 1) {
    throw problem(
      409,
      "CHECKOUT_EXPIRED",
      "Checkout đã hết thời gian xác nhận.",
    );
  }
}

async function removeItemsFromCart(checkout, buyerId, session) {
  await Cart.updateOne(
    { buyerId },
    { $pull: { listingIds: { $in: checkout.items.map((item) => item.listingId) } } },
    { session },
  );
}

module.exports = async function confirmCheckout({ checkoutId, buyerId, shippingAddress }) {
  return mongoose.connection.transaction(async (session) => {
    const { checkout, orders: existingOrders } = await findCheckout(
      checkoutId,
      buyerId,
      session,
    );
    if (existingOrders) return existingOrders;

    const itemsBySeller = await markItemsSold(checkout, session);
    const orders = await createOrders(
      checkout,
      buyerId,
      shippingAddress,
      itemsBySeller,
      session,
    );
    await completeCheckout(checkout, session);
    await removeItemsFromCart(checkout, buyerId, session);
    return orders;
  });
};
