const { validPassword } = require("../domain/passwordRules");
const fail = (code) => Object.assign(new Error(code), { code });

function readStaff(env) {
  const accounts = [
    {
      role: "ADMIN",
      displayName: "Quản trị viên",
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    },
    {
      role: "SUPPORT",
      displayName: "Nhân viên hỗ trợ",
      email: env.SEED_SUPPORT_EMAIL,
      password: env.SEED_SUPPORT_PASSWORD,
    },
  ];
  for (const account of accounts) {
    account.email = String(account.email || "")
      .trim()
      .toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) ||
      !validPassword(account.password)
    ) {
      throw fail("INVALID_STAFF_CONFIG");
    }
  }
  if (accounts[0].email === accounts[1].email)
    throw fail("DUPLICATE_STAFF_EMAIL");
  return accounts;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw fail("DEMO_SEED_ONLY");
  if (!process.env.MONGODB_URI) throw fail("MISSING_MONGODB_URI");
  const accounts = readStaff(process.env);
  const mongoose = require("mongoose");
  const bcrypt = require("bcrypt");
  const User = require("../models/User");
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await User.init();
    // Check both emails before creating either account; never promote an existing USER.
    for (const account of accounts) {
      const existing = await User.findOne({ email: account.email });
      if (existing && existing.role !== account.role)
        throw fail("EMAIL_ROLE_CONFLICT");
    }
    for (const account of accounts) {
      const passwordHash = await bcrypt.hash(account.password, 12);
      const user = await User.findOneAndUpdate(
        { email: account.email },
        {
          $setOnInsert: {
            email: account.email,
            displayName: account.displayName,
            passwordHash,
            role: account.role,
            emailVerifiedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      if (user.role !== account.role) throw fail("EMAIL_ROLE_CONFLICT");
      console.log(`${account.role}: tài khoản đã sẵn sàng.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const code =
      typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : "STAFF_SEED_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}

module.exports = { readStaff };
