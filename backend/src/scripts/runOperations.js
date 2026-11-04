const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { log, cleanupLogs } = require("../http/technicalLog");

const DAY = 24 * 60 * 60 * 1000;
const fail = (code) => Object.assign(new Error(code), { code });

function runCommand(args, extraEnv, signal) {
  return new Promise((resolve, reject) => {
    execFile(
      args[0],
      args.slice(1),
      {
        env: { ...process.env, ...extraEnv },
        signal,
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        // Do not copy command output or errors containing configuration into logs.
        if (error) reject(fail("COMMAND_FAILED"));
        else resolve(stdout);
      },
    );
  });
}

function readSummary(output, fields) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw fail("INVALID_JOB_SUMMARY");
  }
  if (
    !result ||
    fields.some((key) => !Number.isSafeInteger(result[key]) || result[key] < 0)
  ) {
    throw fail("INVALID_JOB_SUMMARY");
  }
  return result;
}

async function runCycle({
  apply = false,
  runId = randomUUID(),
  run = runCommand,
  record = log,
  backupRoot = process.env.BACKUP_ROOT || "/backups",
  maxBatches = Number(process.env.RETENTION_MAX_BATCHES || 100),
  signal,
} = {}) {
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 1000) {
    throw fail("INVALID_BATCH_LIMIT");
  }
  const mode = apply ? "APPLIED" : "DRY_RUN";
  function write(event, fields = {}) {
    if (record({ event, level: "info", runId, mode, ...fields }) === false) {
      throw fail("LOG_IO_FAILED");
    }
  }
  write("retention_started");
  const cli = path.join(__dirname, "retainCases.js");
  const preview = readSummary(
    await run(
      [process.execPath, cli, "--dry-run"],
      { CASE_RETENTION_BACKUP_VERIFIED: "0" },
      signal,
    ),
    ["eligibleCaseCount", "mediaCleanupCandidates", "sharedMediaRetained"],
  );
  write("retention_preview", preview);

  if (
    !apply ||
    preview.eligibleCaseCount +
      preview.mediaCleanupCandidates +
      preview.sharedMediaRetained ===
      0
  ) {
    write("retention_completed", { writesPerformed: 0 });
    return { runId, mode, writesPerformed: 0 };
  }

  // A new private directory prevents an old manifest from satisfying this run.
  // ponytail: backups are retained; define their separate retention policy before long-term operation.
  const runBackupRoot = path.join(backupRoot, runId);
  write("retention_backup_started", { stage: "backup" });
  try {
    await run(
      ["sh", "/opt/rewear-ops/backup.sh"],
      {
        BACKUP_ROOT: runBackupRoot,
        BACKUP_FOR_TRANSFER: "0",
        CASE_RETENTION_BACKUP_VERIFIED: "0",
      },
      signal,
    );
    const directories = fs
      .readdirSync(runBackupRoot, { withFileTypes: true })
      .filter((file) => file.isDirectory());
    if (directories.length !== 1) throw fail("INVALID_BACKUP_MANIFEST");
    const backupDir = path.join(runBackupRoot, directories[0].name);
    const manifest = fs.readFileSync(
      path.join(backupDir, "backup-manifest.txt"),
      "utf8",
    );
    if (
      !/^archive_verified=yes$/m.test(manifest) ||
      !/^uploads_verified=yes$/m.test(manifest)
    ) {
      throw fail("INVALID_BACKUP_MANIFEST");
    }
    for (const filename of ["mongo-full.archive.gz", "uploads.tar.gz"]) {
      if (fs.statSync(path.join(backupDir, filename)).size === 0)
        throw fail("EMPTY_BACKUP");
    }
  } catch {
    throw fail("BACKUP_FAILED");
  }
  write("retention_backup_verified", { stage: "backup" });

  let casesRedacted = 0;
  let deleted = 0;
  for (let batch = 1; batch <= maxBatches; batch += 1) {
    write("retention_batch_started", { batch, stage: "apply" });
    const result = readSummary(
      await run(
        [process.execPath, cli, "--apply", "--confirm-live-db"],
        { CASE_RETENTION_BACKUP_VERIFIED: "1" },
        signal,
      ),
      [
        "casesRedacted",
        "deleted",
        "deferred",
        "errors",
        "eligibleCasesRemaining",
        "pendingMediaRemaining",
        "eligibleMediaRemaining",
      ],
    );
    casesRedacted += result.casesRedacted;
    deleted += result.deleted;
    write("retention_batch", { ...result, runId, batch, stage: "apply" });
    if (result.errors || result.deferred)
      throw fail("MEDIA_CLEANUP_NEEDS_ATTENTION");
    if (
      result.eligibleCasesRemaining === 0 &&
      result.pendingMediaRemaining === 0 &&
      result.eligibleMediaRemaining === 0
    ) {
      write("retention_completed", { casesRedacted, deleted, batch });
      return { runId, mode, casesRedacted, deleted };
    }
    if (result.casesRedacted + result.deleted === 0)
      throw fail("RETENTION_NO_PROGRESS");
  }
  throw fail("RETENTION_BATCH_LIMIT");
}

function writeHealth(status, fields = {}) {
  const dir = process.env.LOG_DIR;
  if (!dir) throw fail("MISSING_LOG_DIR");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temporary = path.join(dir, `retention-health-${process.pid}.tmp`);
  fs.writeFileSync(
    temporary,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status,
      ...fields,
    }),
    { mode: 0o600 },
  );
  fs.renameSync(temporary, path.join(dir, "retention-health.json"));
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => arg !== "--once") ||
    !process.env.LOG_DIR ||
    !["dry-run", "apply"].includes(process.env.RETENTION_MODE || "dry-run")
  ) {
    throw fail("INVALID_OPERATIONS_CONFIG");
  }
  const once = args.includes("--once");
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  writeHealth("starting");
  while (!controller.signal.aborted) {
    const startedAt = Date.now();
    const runId = randomUUID();
    let succeeded = false;
    try {
      const logsDeleted = cleanupLogs();
      if (!log({ event: "log_cleanup_completed", logsDeleted }))
        throw fail("LOG_IO_FAILED");
      const result = await runCycle({
        apply: process.env.RETENTION_MODE === "apply",
        runId,
        signal: controller.signal,
      });
      writeHealth("ok", result);
      succeeded = true;
    } catch (error) {
      if (controller.signal.aborted) break;
      const errorCode = /^[A-Z0-9_]{1,64}$/.test(error.code || "")
        ? error.code
        : "OPERATIONS_FAILED";
      log({
        event: "retention_cycle_failed",
        level: "error",
        errorCode,
        runId,
      });
      writeHealth("error", { errorCode, runId });
    }
    if (once) {
      process.exitCode = succeeded ? 0 : 1;
      break;
    }
    const wait = succeeded
      ? Math.max(1000, DAY - (Date.now() - startedAt))
      : 10 * 60 * 1000;
    try {
      await delay(wait, undefined, { signal: controller.signal });
    } catch {
      break;
    }
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        event: "operations_start_failed",
        level: "error",
        errorCode: "OPERATIONS_START_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}

module.exports = { runCycle };
