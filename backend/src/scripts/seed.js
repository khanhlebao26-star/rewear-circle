const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const fs = require("node:fs/promises");
const path = require("node:path");

const User = require("../models/User");
const Listing = require("../models/Listing");
const Media = require("../models/Media");
const { Cart, Checkout, Order } = require("../models/commerce");

function id(group, number) {
  return new mongoose.Types.ObjectId(group + String(number).padStart(23, "0"));
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Không chạy seed demo trên production.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  await Promise.all(
    [User, Listing, Media, Cart, Checkout, Order].map((Model) => Model.init()),
  );

  const password = "RewearDemo123!";
  const passwordHash = await bcrypt.hash(password, 12);
  const accounts = [
    ["buyer1", "Buyer Một"],
    ["buyer2", "Buyer Hai"],
    ["seller1", "Seller Một"],
    ["seller2", "Seller Hai"],
  ];

  const users = {};

  for (const [index, [key, displayName]] of accounts.entries()) {
    users[key] = await User.findOneAndUpdate(
      { email: `${key}@rewear.local` },
      {
        $setOnInsert: {
          _id: id("1", index + 1),
          email: `${key}@rewear.local`,
          displayName,
          passwordHash,
          role: "USER",
          emailVerifiedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }

  // PNG 1x1 dùng làm ảnh giữ chỗ trong dữ liệu mẫu.
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const uploadDir = path.resolve(__dirname, "../../uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, "seed-demo.png"), image);

  for (const [index, key] of ["seller1", "seller2"].entries()) {
    await Media.updateOne(
      { _id: id("3", index + 1) },
      {
        $setOnInsert: {
          ownerId: users[key]._id,
          filename: "seed-demo.png",
          mimeType: "image/png",
          size: image.length,
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  const rows = [
    ["A1", "seller1", "Áo sơ mi trắng", 120000, true, false],
    ["A2", "seller1", "Áo khoác denim", 150000, true, false],
    ["B1", "seller2", "Áo thun xanh", 200000, true, false],
    ["B2", "seller2", "Áo chờ duyệt", 110000, false, false],
    ["B3", "seller2", "Áo đã bán", 90000, true, true],
  ];

  for (const [index, row] of rows.entries()) {
    const [key, seller, title, price, approved, sold] = row;
    const versionId = id("4", index + 1);

    await Listing.updateOne(
      { _id: id("2", index + 1) },
      {
        $setOnInsert: {
          ownerId: users[seller]._id,
          versions: [
            {
              _id: versionId,
              title,
              category: "Áo",
              size: "M",
              condition: "Đã sử dụng, còn tốt",
              description:
                "Sản phẩm mẫu dùng để kiểm tra giỏ hàng và checkout.",
              flaws: "",
              price,
              shipFrom: "TP. Hồ Chí Minh",
              imageIds: [id("3", seller === "seller1" ? 1 : 2)],
              status: approved ? "APPROVED" : "PENDING",
              submittedAt: new Date(),
            },
          ],
          approvedVersionId: approved ? versionId : null,
          reviewHold: !approved,
          saleStatus: sold ? "SOLD" : "AVAILABLE",
          reservedCheckoutId: null,
          reservedUntil: null,
          sellerHidden: false,
          adminHidden: false,
        },
      },
      { upsert: true, runValidators: true },
    );

    console.log(key, String(id("2", index + 1)), seller, price);
  }

  for (const key of ["buyer1", "buyer2"]) {
    await Cart.updateOne(
      { buyerId: users[key]._id },
      {
        $setOnInsert: {
          listingIds:
            key === "buyer1" ? [id("2", 1), id("2", 2), id("2", 3)] : [],
        },
      },
      { upsert: true },
    );
  }

  console.table(
    accounts.map(([key]) => ({
      email: `${key}@rewear.local`,
      password,
      userId: String(users[key]._id),
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
