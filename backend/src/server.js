const mongoose = require("mongoose");

async function main() {
  for (const key of ["MONGODB_URI", "SESSION_SECRET", "APP_ORIGIN"]) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  require("./config/vnpay")();

  await mongoose.connect(process.env.MONGODB_URI);

  const app = require("./app");
  const Listing = require("./models/Listing");
  const Media = require("./models/Media");
  const Report = require("./models/Report");
  const Case = require("./models/Case");
  const AuditEvent = require("./models/AuditEvent");
  const Notification = require("./models/Notification");
  const {
    Cart,
    Checkout,
    Order,
    PaymentAttempt,
    PaymentEvent,
    CodCollection,
    CodReturnRequest,
  } = require("./models/commerce");

  await Promise.all([
    Listing.init(),
    Media.init(),
    Report.init(),
    Case.init(),
    AuditEvent.init(),
    Notification.init(),
    Cart.init(),
    Checkout.init(),
    Order.init(),
    PaymentAttempt.init(),
    PaymentEvent.init(),
    CodCollection.init(),
    CodReturnRequest.init(),
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
