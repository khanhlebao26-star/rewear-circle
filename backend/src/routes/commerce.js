const router = require("express").Router();
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const { Cart, Checkout, Order } = require("../models/commerce");
const confirmCheckout = require("../services/confirmCheckout");
const { success } = require("../http/responses");
const {
  requireAuth,
  requireVerifiedEmail,
} = require("../middleware/requireAuth");
const {
  problem,
  validId,
  approvedVersion,
  approvedVisibleListingQuery,
  snapshot,
  availableStates,
  sameSelection,
  readAddress,
} = require("../domain/commerceRules");

const HOLD_MS = 15 * 60 * 1000;
const buyerOnly = [requireAuth, requireVerifiedEmail];

function checkId(value) {
  if (!validId(value)) {
    throw problem(422, "INVALID_ID", "ID không hợp lệ.");
  }
}

// Dọn trạng thái khi có request.
// Quyền giữ hết hạn dựa trên thời gian trong database.
async function releaseListingReservations(filter, session) {
  const update = {
    $set: {
      saleStatus: "AVAILABLE",
      reservedCheckoutId: null,
      reservedUntil: null,
    },
    $inc: { __v: 1 },
  };
  return Listing.updateMany(filter, update, session ? { session } : undefined);
}

async function releaseExpired() {
  const now = new Date();

  await releaseListingReservations({
    saleStatus: "RESERVED",
    reservedUntil: { $lte: now },
  });

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

// Danh sách tin đã duyệt và có thể mua.
router.get("/listings", async (req, res) => {
  await releaseExpired();

  const listings = await Listing.find(
    approvedVisibleListingQuery({ $or: availableStates(new Date()) }),
  )
    .sort({ createdAt: -1 })
    .limit(50);

  return success(
    req,
    res,
    listings
      .filter((listing) => approvedVersion(listing))
      .map((listing) => snapshot(listing)),
    200,
    { serverNow: new Date().toISOString() },
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

  return success(req, res, { items }, 200, {
    serverNow: new Date().toISOString(),
  });
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

  return success(req, res, cart, 200, { serverNow: new Date().toISOString() });
});

router.delete("/cart/items/:id", requireAuth, async (req, res) => {
  checkId(req.params.id);

  await Cart.updateOne(
    { buyerId: req.user._id },
    { $pull: { listingIds: req.params.id } },
  );

  return success(req, res, { removed: true }, 200, {
    serverNow: new Date().toISOString(),
  });
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
          approvedVisibleListingQuery({
            _id: id,
            ownerId: { $ne: req.user._id },
            $or: availableStates(new Date()),
          }),
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

  return success(req, res, result.checkout, result.reused ? 200 : 201, {
    serverNow: new Date().toISOString(),
  });
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

  return success(req, res, checkout, 200, { serverNow: new Date().toISOString() });
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

    await releaseListingReservations(
      {
        saleStatus: "RESERVED",
        reservedCheckoutId: current._id,
      },
      session,
    );

    current.status = current.expiresAt <= new Date() ? "EXPIRED" : "CANCELLED";

    await current.save({ session });
    return current;
  });

  return success(req, res, checkout, 200, { serverNow: new Date().toISOString() });
});

router.post("/checkouts/:id/confirm", ...buyerOnly, async (req, res) => {
  checkId(req.params.id);
  const shippingAddress = readAddress(req.body?.shippingAddress);
  await releaseExpired();

  const orders = await confirmCheckout({
    checkoutId: req.params.id,
    buyerId: req.user._id,
    shippingAddress,
  });

  return success(req, res, orders, 200, { serverNow: new Date().toISOString() });
});

router.get("/me/orders", requireAuth, async (req, res) => {
  const orders = await Order.find({ buyerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  return success(req, res, orders, 200, { serverNow: new Date().toISOString() });
});

router.get("/me/sales", requireAuth, async (req, res) => {
  const orders = await Order.find({ sellerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  return success(req, res, orders, 200, { serverNow: new Date().toISOString() });
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

  return success(req, res, order, 200, { serverNow: new Date().toISOString() });
});

module.exports = router;
