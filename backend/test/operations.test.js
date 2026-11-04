const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { log, cleanupLogs } = require("../src/http/technicalLog");
const { runCycle } = require("../src/scripts/runOperations");

const preview = {
  eligibleCaseCount: 1,
  mediaCleanupCandidates: 1,
  sharedMediaRetained: 0,
};
const complete = {
  mode: "APPLIED",
  casesRedacted: 1,
  deleted: 1,
  deferred: 0,
  errors: 0,
  eligibleCasesRemaining: 0,
  pendingMediaRemaining: 0,
  eligibleMediaRemaining: 0,
};
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rewear-operations-"));
  assert.equal(
    path.dirname(fs.realpathSync(dir)).toLowerCase(),
    fs.realpathSync(os.tmpdir()).toLowerCase(),
  );
  assert.match(path.basename(dir), /^rewear-operations-/);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function fakeBackup(root, valid = true) {
  const dir = path.join(root, "rewear-fixture");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "backup-manifest.txt"),
    valid
      ? "archive_verified=yes\nuploads_verified=yes\n"
      : "archive_verified=no\n",
  );
  fs.writeFileSync(path.join(dir, "mongo-full.archive.gz"), "fixture");
  fs.writeFileSync(path.join(dir, "uploads.tar.gz"), "fixture");
}

test("technical logs persist only allowed fields and do not keep query strings", (t) => {
  const dir = temporary(t);
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(
    log(
      {
        event: "http_request",
        requestId: "test-id",
        method: "GET",
        route: "/secret?token=do-not-keep",
        password: "do-not-keep",
        cookie: "do-not-keep",
        statusCode: 200,
        durationMs: 2,
      },
      { dir, now },
    ),
    true,
  );
  const record = JSON.parse(
    fs.readFileSync(path.join(dir, "api-2026-11-03.jsonl"), "utf8"),
  );
  assert.equal(record.timestamp, now.toISOString());
  assert.equal(record.statusCode, 200);
  assert.equal("route" in record, false);
  assert.equal(JSON.stringify(record).includes("do-not-keep"), false);
});

test("log cleanup retains exactly 30 UTC date buckets and leaves unrelated files alone", (t) => {
  const dir = temporary(t);
  const now = new Date("2026-11-03T12:00:00Z");
  for (const name of [
    "api-2026-10-04.jsonl",
    "api-2026-10-05.jsonl",
    "retention-2026-10-04.jsonl",
    "api-2026-11-03.jsonl",
    "retention-health.json",
    "unrelated-2020-01-01.jsonl",
  ]) {
    fs.writeFileSync(path.join(dir, name), "fixture");
  }
  assert.equal(cleanupLogs({ dir, now }), 2);
  assert.equal(fs.existsSync(path.join(dir, "api-2026-10-05.jsonl")), true);
  assert.equal(fs.existsSync(path.join(dir, "retention-health.json")), true);
  assert.equal(
    fs.existsSync(path.join(dir, "unrelated-2020-01-01.jsonl")),
    true,
  );
  assert.equal(cleanupLogs({ dir, now }), 0);
});

test("dry-run never starts backup or apply", async () => {
  let calls = 0;
  const result = await runCycle({
    record: () => true,
    run: async (args, env) => {
      calls += 1;
      assert.equal(args.includes("--dry-run"), true);
      assert.equal(env.CASE_RETENTION_BACKUP_VERIFIED, "0");
      return JSON.stringify(preview);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.writesPerformed, 0);
});

test("failure to persist the first log prevents any database or backup command", async () => {
  let commands = 0;
  await assert.rejects(
    runCycle({
      apply: true,
      record: () => false,
      run: async () => {
        commands += 1;
        return JSON.stringify(preview);
      },
    }),
    { code: "LOG_IO_FAILED" },
  );
  assert.equal(commands, 0);
});

test("media-only reclamation is discovered by preview and backed up before apply", async (t) => {
  const dir = temporary(t);
  const calls = [];
  const result = await runCycle({
    apply: true, backupRoot: dir, record: () => true,
    run: async (args, env) => {
      if (args.includes("--dry-run")) {
        calls.push("preview");
        return JSON.stringify({ ...preview, eligibleCaseCount: 0 });
      }
      if (args[0] === "sh") {
        calls.push("backup");
        fakeBackup(env.BACKUP_ROOT);
        return "";
      }
      calls.push("apply");
      assert.equal(env.CASE_RETENTION_BACKUP_VERIFIED, "1");
      return JSON.stringify({ ...complete, casesRedacted: 0 });
    },
  });
  assert.deepEqual(calls, ["preview", "backup", "apply"]);
  assert.equal(result.deleted, 1);
});

test("failed backup command and invalid manifest both prevent apply", async (t) => {
  const dir = temporary(t);
  for (const invalidManifest of [false, true]) {
    let applies = 0;
    await assert.rejects(
      runCycle({
        apply: true,
        backupRoot: dir,
        record: () => true,
        run: async (args, env) => {
          if (args.includes("--dry-run")) return JSON.stringify(preview);
          if (args[0] === "sh") {
            if (invalidManifest) fakeBackup(env.BACKUP_ROOT, false);
            else throw new Error("simulated backup failure");
            return "";
          }
          applies += 1;
          return JSON.stringify(complete);
        },
      }),
      { code: "BACKUP_FAILED" },
    );
    assert.equal(applies, 0);
  }
});

test("verified backup precedes every apply; multiple batches drain; a repeat with no work does not apply", async (t) => {
  const dir = temporary(t);
  const sequence = [];
  let applies = 0;
  let noWork = false;
  const run = async (args, env) => {
    if (args.includes("--dry-run"))
      return JSON.stringify(
        noWork
          ? {
              eligibleCaseCount: 0,
              mediaCleanupCandidates: 0,
              sharedMediaRetained: 0,
            }
          : preview,
      );
    if (args[0] === "sh") {
      sequence.push("backup");
      fakeBackup(env.BACKUP_ROOT);
      return "";
    }
    sequence.push("apply");
    assert.equal(env.CASE_RETENTION_BACKUP_VERIFIED, "1");
    assert.equal(args.includes("--confirm-live-db"), true);
    applies += 1;
    return JSON.stringify(
      applies === 1 ? { ...complete, eligibleMediaRemaining: 1 } : complete,
    );
  };
  const options = { apply: true, backupRoot: dir, run, record: () => true };
  const result = await runCycle(options);
  assert.deepEqual(sequence, ["backup", "apply", "apply"]);
  assert.equal(result.casesRedacted, 2);
  assert.equal(result.deleted, 2);
  noWork = true;
  const replay = await runCycle(options);
  assert.equal(replay.writesPerformed, 0);
  assert.equal(applies, 2);
});

test("no progress, deferred media and batch limits stop the loop", async (t) => {
  const dir = temporary(t);
  const scenarios = [
    [
      { ...complete, casesRedacted: 0, deleted: 0, pendingMediaRemaining: 1 },
      "RETENTION_NO_PROGRESS",
    ],
    [
      { ...complete, deferred: 1, pendingMediaRemaining: 1 },
      "MEDIA_CLEANUP_NEEDS_ATTENTION",
    ],
    [{ ...complete, eligibleCasesRemaining: 1 }, "RETENTION_BATCH_LIMIT"],
  ];
  for (const [summary, code] of scenarios) {
    let applies = 0;
    await assert.rejects(
      runCycle({
        apply: true,
        backupRoot: dir,
        maxBatches: 1,
        record: () => true,
        run: async (args, env) => {
          if (args.includes("--dry-run")) return JSON.stringify(preview);
          if (args[0] === "sh") {
            fakeBackup(env.BACKUP_ROOT);
            return "";
          }
          applies += 1;
          return JSON.stringify(summary);
        },
      }),
      { code },
    );
    assert.equal(applies, 1);
  }
});
