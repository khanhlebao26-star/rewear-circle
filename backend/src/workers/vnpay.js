const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const Listing = require("../models/Listing");
const AuditEvent = require("../models/AuditEvent");
const { Checkout, Order, PaymentAttempt, PaymentEvent } = require("../models/commerce");
const { runReconciliationCycle } = require("../jobs/vnpayReconciliation");

const INTERVAL_MS = 10_000;
let stopping = false;

function log(fields) {
  process.stdout.write(`${JSON.stringify(fields)}\n`);
}

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

  const workerId = randomUUID();
  let activeRunId = null;
  let lastCompletedAt = null;
  let consecutiveFailures = 0;
  const heartbeat = setInterval(() => log({
    event: "vnpay_worker_heartbeat",
    level: "info",
    workerId,
    activeRunId,
    lastCompletedAt,
    consecutiveFailures,
    databaseReady: mongoose.connection.readyState === 1,
  }), INTERVAL_MS);
  heartbeat.unref();
  log({ event: "vnpay_worker_started", level: "info", workerId });

  while (!stopping) {
    activeRunId = randomUUID();
    try {
      const result = await runReconciliationCycle();
      consecutiveFailures = 0;
      lastCompletedAt = new Date().toISOString();
      log({ event: "vnpay_worker_cycle_completed", level: "info", workerId, runId: activeRunId, ...result });
    } catch (error) {
      consecutiveFailures += 1;
      lastCompletedAt = new Date().toISOString();
      log({
        event: "vnpay_worker_cycle_failed",
        level: "error",
        workerId,
        runId: activeRunId,
        errorType: error.name || "Error",
        errorCode: typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : "RECONCILIATION_FAILED",
      });
    }
    activeRunId = null;
    if (!stopping) await wait(INTERVAL_MS);
  }
  clearInterval(heartbeat);
  log({ event: "vnpay_worker_stopped", level: "info", workerId });
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "vnpay_worker_start_failed",
    level: "error",
    errorType: error.name || "Error",
    errorCode: typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : "WORKER_FAILED",
  }));
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
