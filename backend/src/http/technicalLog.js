const fs = require("node:fs");
const path = require("node:path");

const DATE_FILE = /^(api|retention)-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const cleanedDays = new Map();
const numbers = [
  "statusCode",
  "durationMs",
  "port",
  "batch",
  "casesRedacted",
  "deleted",
  "deferred",
  "errors",
  "eligibleCasesRemaining",
  "pendingMediaRemaining",
  "eligibleMediaRemaining",
  "eligibleCaseCount",
  "mediaCleanupCandidates",
  "sharedMediaRetained",
  "writesPerformed",
  "logsDeleted",
];

// Retain today's UTC date and the preceding 29 UTC dates.
function cleanupLogs({ dir = process.env.LOG_DIR, now = new Date() } = {}) {
  if (!dir) return 0;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  let deleted = 0;
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const match = DATE_FILE.exec(file.name);
    if (file.isFile() && match && match[2] < cutoffDay) {
      fs.rmSync(path.join(dir, file.name), { force: true });
      deleted += 1;
    }
  }
  return deleted;
}

function log(entry, { dir = process.env.LOG_DIR, now = new Date() } = {}) {
  const service = process.env.LOG_SERVICE === "retention" ? "retention" : "api";
  const record = {
    timestamp: now.toISOString(),
    service,
    event: /^[a-z][a-z0-9_]{0,63}$/.test(entry.event || "")
      ? entry.event
      : "invalid_log_event",
    level: ["info", "warn", "error"].includes(entry.level)
      ? entry.level
      : "info",
  };
  for (const key of [
    "requestId",
    "runId",
    "errorCode",
    "errorType",
    "mode",
    "stage",
  ]) {
    if (
      typeof entry[key] === "string" &&
      /^[A-Za-z0-9_-]{1,100}$/.test(entry[key])
    ) {
      record[key] = entry[key];
    }
  }
  if (
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
      entry.method,
    )
  ) {
    record.method = entry.method;
  }
  if (
    typeof entry.route === "string" &&
    entry.route.length <= 200 &&
    !/[?#\u0000-\u001f\u007f]/.test(entry.route)
  ) {
    record.route = entry.route;
  }
  for (const key of numbers) {
    if (
      typeof entry[key] === "number" &&
      Number.isFinite(entry[key]) &&
      entry[key] >= 0
    ) {
      record[key] = entry[key];
    }
  }
  const line = JSON.stringify(record);
  console.log(line);
  if (!dir) return true;
  try {
    const day = now.toISOString().slice(0, 10);
    if (cleanedDays.get(dir) !== day) {
      cleanupLogs({ dir, now });
      cleanedDays.set(dir, day);
    }
    // ponytail: synchronous append suits this MVP; use an async buffered writer if throughput requires it.
    fs.appendFileSync(path.join(dir, `${service}-${day}.jsonl`), `${line}\n`, {
      mode: 0o600,
    });
    return true;
  } catch {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "technical_log_write_failed",
        level: "error",
        errorCode: "LOG_IO_FAILED",
      }),
    );
    return false;
  }
}

module.exports = { log, cleanupLogs };
