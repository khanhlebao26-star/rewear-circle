const test = require("node:test");
const assert = require("node:assert/strict");
const { readStaff } = require("../src/scripts/seedStaff");
const { validPassword } = require("../src/domain/passwordRules");

test("password limits use UTF-8 bytes and staff roles remain fixed", () => {
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("a".repeat(72)), true);
  assert.equal(validPassword("a".repeat(73)), false);
  assert.equal(validPassword("\u00e1".repeat(37)), false);
  assert.equal(validPassword({ length: 20 }), false);
  const env = {
    SEED_ADMIN_EMAIL: " Admin@rewear.test ",
    SEED_ADMIN_PASSWORD: "synthetic-admin-password",
    SEED_SUPPORT_EMAIL: "support@rewear.test",
    SEED_SUPPORT_PASSWORD: "synthetic-support-password",
    SEED_ADMIN_ROLE: "USER",
  };
  const staff = readStaff(env);
  assert.equal(staff[0].email, "admin@rewear.test");
  assert.deepEqual(
    staff.map((account) => account.role),
    ["ADMIN", "SUPPORT"],
  );
  assert.throws(() => readStaff({}), { code: "INVALID_STAFF_CONFIG" });
  assert.throws(() => readStaff({ ...env, SEED_ADMIN_PASSWORD: "short" }), {
    code: "INVALID_STAFF_CONFIG",
  });
  assert.throws(
    () => readStaff({ ...env, SEED_SUPPORT_EMAIL: env.SEED_ADMIN_EMAIL }),
    { code: "DUPLICATE_STAFF_EMAIL" },
  );
});

test(
  "staff seed creates verified roles, replays safely and never promotes a USER",
  {
    skip:
      !process.env.MONGODB_TEST_URI &&
      "Set MONGODB_TEST_URI to a private database ending in _test",
  },
  async () => {
    const uri = process.env.MONGODB_TEST_URI;
    assert.match(new URL(uri).pathname, /_test$/);
    const mongoose = require("mongoose");
    const bcrypt = require("bcrypt");
    const path = require("node:path");
    const { randomUUID } = require("node:crypto");
    const execFile = require("node:util").promisify(
      require("node:child_process").execFile,
    );
    const User = require("../src/models/User");
    const prefix = randomUUID();
    const emails = ["admin", "support", "existing-user", "unused-support"].map(
      (key) => `${prefix}-${key}@staff.test`,
    );
    const env = {
      ...process.env,
      NODE_ENV: "test",
      MONGODB_URI: uri,
      SEED_ADMIN_EMAIL: emails[0],
      SEED_ADMIN_PASSWORD: "SyntheticAdminPassword123!",
      SEED_SUPPORT_EMAIL: emails[1],
      SEED_SUPPORT_PASSWORD: "SyntheticSupportPassword123!",
    };
    const run = (config) =>
      execFile(
        process.execPath,
        [path.join(__dirname, "../src/scripts/seedStaff.js")],
        {
          env: config,
          timeout: 20000,
          maxBuffer: 65536,
        },
      );
    await mongoose.connect(uri);
    try {
      await User.init();
      await run(env);
      const admin = await User.findOne({ email: emails[0] }).select(
        "+passwordHash",
      );
      const support = await User.findOne({ email: emails[1] }).select(
        "+passwordHash",
      );
      assert.equal(admin.role, "ADMIN");
      assert.equal(support.role, "SUPPORT");
      assert.ok(admin.emailVerifiedAt && support.emailVerifiedAt);
      assert.equal(
        await bcrypt.compare(env.SEED_ADMIN_PASSWORD, admin.passwordHash),
        true,
      );
      assert.equal(
        await bcrypt.compare(env.SEED_SUPPORT_PASSWORD, support.passwordHash),
        true,
      );
      await run({ ...env, SEED_ADMIN_PASSWORD: "AChangedEnvPassword123!" });
      assert.equal(
        await User.countDocuments({ email: { $in: emails.slice(0, 2) } }),
        2,
      );
      assert.equal(
        (await User.findOne({ email: emails[0] }).select("+passwordHash"))
          .passwordHash,
        admin.passwordHash,
      );
      await User.create({
        email: emails[2],
        passwordHash: "unused",
        displayName: "Existing user",
        role: "USER",
      });
      await assert.rejects(
        run({
          ...env,
          SEED_ADMIN_EMAIL: emails[2],
          SEED_SUPPORT_EMAIL: emails[3],
        }),
        (error) => String(error.stderr).includes("EMAIL_ROLE_CONFLICT"),
      );
      assert.equal((await User.findOne({ email: emails[2] })).role, "USER");
      assert.equal(await User.countDocuments({ email: emails[3] }), 0);
    } finally {
      await User.deleteMany({ email: { $in: emails } });
      await mongoose.disconnect();
    }
  },
);
