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
  const Media = require("./models/Media");
  const Complaint = require("./models/Complaint");
  const ComplaintQuota = require("./models/ComplaintQuota");
  const Report = require("./models/Report");
  const Case = require("./models/Case");
  const AuditEvent = require("./models/AuditEvent");
  const Notification = require("./models/Notification");
  const {
    Cart,
    Checkout,
    Order,
    CodCollection,
    CodReturnRequest,
  } = require("./models/commerce");

  await Promise.all([
    Listing.init(),
    Media.init(),
    Complaint.init(),
    ComplaintQuota.init(),
    Report.init(),
    Case.init(),
    AuditEvent.init(),
    Notification.init(),
    Cart.init(),
    Checkout.init(),
    Order.init(),
    CodCollection.init(),
    CodReturnRequest.init(),
  ]);

  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    console.log(JSON.stringify({ event: "api_started", level: "info", port }));
  });
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "api_start_failed",
    level: "error",
    errorType: error.name || "Error",
    errorCode: typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : "STARTUP_FAILED",
  }));
  process.exit(1);
});
