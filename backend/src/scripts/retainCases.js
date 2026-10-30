const mongoose = require("mongoose");
const { runCaseRetention } = require("../jobs/caseRetention");

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (!["--dry-run", "--apply", "--confirm-live-db"].includes(arg)) {
      throw Object.assign(new Error("Unsupported argument."), { code: "INVALID_ARGUMENT" });
    }
  }
  if (args.has("--apply") && args.has("--dry-run")) {
    throw Object.assign(new Error("Choose either --dry-run or --apply."), { code: "INVALID_ARGUMENT" });
  }
  if (!process.env.MONGODB_URI) {
    throw Object.assign(new Error("Missing environment variable."), { code: "MISSING_CONFIG" });
  }

  const apply = args.has("--apply");
  const databaseName = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.slice(1));
  if (apply && !databaseName.endsWith("_test")) {
    if (!args.has("--confirm-live-db") || process.env.CASE_RETENTION_BACKUP_VERIFIED !== "1") {
      throw Object.assign(new Error("Live database apply requires --confirm-live-db and verified backup."), { code: "LIVE_APPLY_GUARD" });
    }
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const result = await runCaseRetention({ dryRun: !apply });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "case_retention_failed",
    level: "error",
    errorType: error.name || "Error",
    errorCode: typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : "RETENTION_FAILED",
  }));
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
