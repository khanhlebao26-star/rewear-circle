const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Checkout, Order, PaymentAttempt, PaymentEvent } = require("../models/commerce");
const { runReconciliationCycle } = require("../jobs/vnpayReconciliation");

const INTERVAL_MS = 10_000;
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Missing environment variable: MONGODB_URI");
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([
    Listing.init(), Checkout.init(), Order.init(), PaymentAttempt.init(), PaymentEvent.init(), AuditEvent.init(),
  ]);

  while (!stopping) {
    try {
      await runReconciliationCycle();
    } catch (error) {
      console.error("VNPAY reconciliation cycle failed:", error.code || error.name || "UNKNOWN_ERROR");
    }
    if (!stopping) await wait(INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error("VNPAY worker failed:", error.code || error.name || "UNKNOWN_ERROR");
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
