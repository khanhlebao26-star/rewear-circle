const mongoose = require("mongoose");

async function main() {
  for (const key of ["MONGODB_URI", "SESSION_SECRET", "APP_ORIGIN"]) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const app = require("./app");
  const Listing = require("./models/Listing");
  const { Cart, Checkout, Order } = require("./models/commerce");

  await Promise.all([
    Listing.init(),
    Cart.init(),
    Checkout.init(),
    Order.init(),
  ]);

  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exit(1);
});
