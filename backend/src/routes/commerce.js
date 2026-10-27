const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const { Cart, Checkout, Order } = require("../models/commerce");
const {
  requireAuth,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");

const HOLD_MS = 15 * 60 * 1000;
const buyerOnly = [requireAuth, requireVerifiedEmail];

function problem(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function ok(req, res, data, status = 200) {
  return res.status(status).json({
    data,
    meta: {
      requestId: req.requestId,
      serverNow: new Date().toISOString(),
    },
  });
}

function validId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function checkId(value) {
  if (!validId(value)) {
    throw problem(422, "INVALID_ID", "ID không hợp lệ.");
  }
}

function approvedVersion(listing) {
  if (
    !listing ||
    listing.reviewHold ||
    listing.sellerHidden ||
    listing.adminHidden
  ) {
    return null;
  }

  const version = listing.versions.id(listing.approvedVersionId);
  return version?.status === "APPROVED" ? version : null;
}

function snapshot(listing) {
  const version = approvedVersion(listing);

  if (!version) {
    throw problem(
      409,
      "LISTING_UNAVAILABLE",
      "Tin không còn đủ điều kiện mua.",
    );
  }

  return {
    listingId: listing._id,
    versionId: version._id,
    sellerId: listing.ownerId,
    title: version.title,
    price: version.price,
    imageIds: version.imageIds,
  };
}

function availableStates(now) {
  return [
    { saleStatus: "AVAILABLE" },
    {
      saleStatus: "RESERVED",
      reservedUntil: { $lte: now },
    },
  ];
}

// Dọn trạng thái khi có request.
// Quyền giữ hết hạn dựa trên thời gian trong database.
async function releaseExpired() {
  const now = new Date();

  await Listing.updateMany(
    {
      saleStatus: "RESERVED",
      reservedUntil: { $lte: now },
    },
    {
      $set: {
        saleStatus: "AVAILABLE",
        reservedCheckoutId: null,
        reservedUntil: null,
      },
      $inc: { __v: 1 },
    },
  );

  await Checkout.updateMany(
    { status: "OPEN", expiresAt: { $lte: now } },
    {
      $set: { status: "EXPIRED" },
      $inc: { __v: 1 },
    },
  );
}

async function ensureCart(buyerId) {
  try {
    return await Cart.findOneAndUpdate(
      { buyerId },
      { $setOnInsert: { listingIds: [] } },
      { upsert: true, new: true },
    );
  } catch (error) {
    // Hai request có thể cùng tạo giỏ đầu tiên của một Buyer.
    if (error.code !== 11000) throw error;
    return Cart.findOne({ buyerId });
  }
}

function sameSelection(checkout, ids) {
  const saved = checkout.items.map((item) => String(item.listingId)).sort();

  if (saved.join(",") !== ids.join(",")) {
    throw problem(
      409,
      "REQUEST_KEY_REUSED",
      "requestKey đã được dùng cho danh sách món khác.",
    );
  }
}

function readAddress(value) {
  const result = {
    fullName: typeof value?.fullName === "string" ? value.fullName.trim() : "",
    phone: typeof value?.phone === "string" ? value.phone.trim() : "",
    address: typeof value?.address === "string" ? value.address.trim() : "",
  };

  if (
    result.fullName.length < 2 ||
    result.fullName.length > 100 ||
    !/^\+?\d{9,15}$/.test(result.phone) ||
    result.address.length < 10 ||
    result.address.length > 500
  ) {
    throw problem(
      422,
      "INVALID_ADDRESS",
      "Tên, số điện thoại hoặc địa chỉ không hợp lệ.",
    );
  }

  return result;
}

// Danh sách tin đã duyệt và có thể mua.
router.get("/listings", async (req, res) => {
  await releaseExpired();

  const listings = await Listing.find({
    approvedVersionId: { $ne: null },
    reviewHold: false,
    sellerHidden: false,
    adminHidden: false,
    $or: availableStates(new Date()),
  })
    .sort({ createdAt: -1 })
    .limit(50);

  return ok(
    req,
    res,
    listings
      .filter((listing) => approvedVersion(listing))
      .map((listing) => snapshot(listing)),
  );
});

router.get("/cart", requireAuth, async (req, res) => {
  await releaseExpired();
  const cart = await ensureCart(req.user._id);

  const listings = await Listing.find({
    _id: { $in: cart.listingIds },
  });

  const byId = new Map(
    listings.map((listing) => [String(listing._id), listing]),
  );

  const items = cart.listingIds.map((listingId) => {
    const listing = byId.get(String(listingId));

    if (!approvedVersion(listing)) {
      return { listingId, availability: "UNAVAILABLE" };
    }

    return {
      ...snapshot(listing),
      availability: listing.saleStatus,
    };
  });

  return ok(req, res, { items });
});

router.post("/cart/items", ...buyerOnly, async (req, res) => {
  const listingId = req.body?.listingId;
  checkId(listingId);
  await releaseExpired();

  const listing = await Listing.findById(listingId);

  if (!approvedVersion(listing) || listing.saleStatus !== "AVAILABLE") {
    throw problem(
      409,
      "LISTING_UNAVAILABLE",
      "Món đã bán, đang được giữ hoặc chưa được duyệt.",
    );
  }

  if (String(listing.ownerId) === String(req.user._id)) {
    throw problem(422, "OWN_LISTING", "Không thể mua món của chính mình.");
  }

  await ensureCart(req.user._id);

  const cart = await Cart.findOneAndUpdate(
    { buyerId: req.user._id },
    { $addToSet: { listingIds: listing._id } },
    { new: true },
  );

  return ok(req, res, cart);
});

router.delete("/cart/items/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);

  await Cart.updateOne(
    { buyerId: req.user._id },
    { $pull: { listingIds: req.params.id } },
  );

  return ok(req, res, { removed: true });
});

router.post("/checkouts", ...buyerOnly, async (req, res) => {
  const input = req.body?.listingIds;
  const requestKey = req.body?.requestKey;

  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > 20 ||
    !input.every(validId) ||
    typeof requestKey !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey)
  ) {
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Cần 1–20 listingIds và requestKey hợp lệ.",
    );
  }

  const ids = input.map((id) => id.toLowerCase()).sort();

  if (new Set(ids).size !== ids.length) {
    throw problem(422, "DUPLICATE_ITEM", "Danh sách có món trùng.");
  }

  await releaseExpired();
  let result;

  try {
    result = await mongoose.connection.transaction(async (session) => {
      const existing = await Checkout.findOne({
        buyerId: req.user._id,
        requestKey,
      }).session(session);

      if (existing) {
        sameSelection(existing, ids);
        return { checkout: existing, reused: true };
      }

      const cart = await Cart.findOne({
        buyerId: req.user._id,
      }).session(session);

      const cartIds = new Set((cart?.listingIds || []).map(String));

      if (!ids.every((id) => cartIds.has(id))) {
        throw problem(
          422,
          "ITEM_NOT_IN_CART",
          "Các món được chọn phải có trong giỏ.",
        );
      }

      const checkoutId = new mongoose.Types.ObjectId();
      const expiresAt = new Date(Date.now() + HOLD_MS);
      const items = [];

      for (const id of ids) {
        const listing = await Listing.findOneAndUpdate(
          {
            _id: id,
            ownerId: { $ne: req.user._id },
            approvedVersionId: { $ne: null },
            reviewHold: false,
            sellerHidden: false,
            adminHidden: false,
            $or: availableStates(new Date()),
          },
          {
            $set: {
              saleStatus: "RESERVED",
              reservedCheckoutId: checkoutId,
              reservedUntil: expiresAt,
            },
            $inc: { __v: 1 },
          },
          { new: true, session },
        );

        if (!listing) {
          throw problem(
            409,
            "LISTING_UNAVAILABLE",
            "Có món vừa được người khác giữ hoặc mua.",
          );
        }

        items.push(snapshot(listing));
      }

      const [checkout] = await Checkout.create(
        [
          {
            _id: checkoutId,
            buyerId: req.user._id,
            requestKey,
            items,
            expiresAt,
          },
        ],
        { session },
      );

      return { checkout, reused: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;

    const existing = await Checkout.findOne({
      buyerId: req.user._id,
      requestKey,
    });

    if (!existing) throw error;

    sameSelection(existing, ids);
    result = { checkout: existing, reused: true };
  }

  return ok(req, res, result.checkout, result.reused ? 200 : 201);
});

router.get("/checkouts/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);
  await releaseExpired();

  const checkout = await Checkout.findOne({
    _id: req.params.id,
    buyerId: req.user._id,
  });

  if (!checkout) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
  }

  return ok(req, res, checkout);
});

router.post("/checkouts/:id/cancel", requireAuth, async (req, res) => {
  checkId(req.params.id);
  await releaseExpired();

  const checkout = await mongoose.connection.transaction(async (session) => {
    const current = await Checkout.findOne({
      _id: req.params.id,
      buyerId: req.user._id,
    }).session(session);

    if (!current) {
      throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
    }

    if (current.status === "COMPLETED") {
      throw problem(409, "ALREADY_COMPLETED", "Checkout đã tạo đơn.");
    }

    if (current.status !== "OPEN") return current;

    await Listing.updateMany(
      {
        saleStatus: "RESERVED",
        reservedCheckoutId: current._id,
      },
      {
        $set: {
          saleStatus: "AVAILABLE",
          reservedCheckoutId: null,
          reservedUntil: null,
        },
        $inc: { __v: 1 },
      },
      { session },
    );

    current.status = current.expiresAt <= new Date() ? "EXPIRED" : "CANCELLED";

    await current.save({ session });
    return current;
  });

  return ok(req, res, checkout);
});

router.post("/checkouts/:id/confirm", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const shippingAddress = readAddress(req.body?.shippingAddress);
  await releaseExpired();

  const orders = await mongoose.connection.transaction(async (session) => {
    const checkout = await Checkout.findOne({
      _id: req.params.id,
      buyerId: req.user._id,
    }).session(session);

    if (!checkout) {
      throw problem(404, "NOT_FOUND", "Không tìm thấy checkout.");
    }

    if (checkout.status === "COMPLETED") {
      return Order.find({ checkoutId: checkout._id })
        .sort({ sellerId: 1 })
        .session(session);
    }

    if (checkout.status !== "OPEN" || checkout.expiresAt <= new Date()) {
      throw problem(
        409,
        "CHECKOUT_UNAVAILABLE",
        "Checkout đã hết hạn hoặc đã hủy.",
      );
    }

    const groups = new Map();

    for (const item of checkout.items) {
      const updated = await Listing.updateOne(
        {
          _id: item.listingId,
          ownerId: item.sellerId,
          approvedVersionId: item.versionId,
          versions: {
            $elemMatch: {
              _id: item.versionId,
              status: "APPROVED",
            },
          },
          reviewHold: false,
          sellerHidden: false,
          adminHidden: false,
          saleStatus: "RESERVED",
          reservedCheckoutId: checkout._id,
          reservedUntil: { $gt: new Date() },
        },
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

      if (!groups.has(sellerId)) groups.set(sellerId, []);
      groups.get(sellerId).push(item.toObject());
    }

    const created = [];

    for (const [sellerId, items] of groups) {
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      const shippingFee = 0;

      const [order] = await Order.create(
        [
          {
            checkoutId: checkout._id,
            buyerId: req.user._id,
            sellerId,
            items,
            shippingAddress,
            subtotal,
            shippingFee,
            total: subtotal + shippingFee,
          },
        ],
        { session },
      );

      created.push(order);
    }

    const completed = await Checkout.updateOne(
      {
        _id: checkout._id,
        status: "OPEN",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: { status: "COMPLETED" },
        $inc: { __v: 1 },
      },
      { session },
    );

    if (completed.modifiedCount !== 1) {
      throw problem(
        409,
        "CHECKOUT_EXPIRED",
        "Checkout đã hết thời gian xác nhận.",
      );
    }

    await Cart.updateOne(
      { buyerId: req.user._id },
      {
        $pull: {
          listingIds: {
            $in: checkout.items.map((item) => item.listingId),
          },
        },
      },
      { session },
    );

    return created;
  });

  return ok(req, res, orders);
});

router.get("/me/orders", requireAuth, async (req, res) => {
  const orders = await Order.find({ buyerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  return ok(req, res, orders);
});

router.get("/me/sales", requireAuth, async (req, res) => {
  const orders = await Order.find({ sellerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  return ok(req, res, orders);
});

router.get("/orders/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);

  const order = await Order.findOne({
    _id: req.params.id,
    $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
  });

  if (!order) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  }

  return ok(req, res, order);
});

module.exports = router;
