const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String, default: null },
    role: { type: String, enum: ["USER", "ADMIN", "SUPPORT"], default: "USER" },
    caseAccessFence: { type: Number, default: 0, select: false },
    emailVerifiedAt: { type: Date, default: null },
    verificationHash: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    verificationAttempts: { type: Number, default: 0 },
    verificationSentAt: { type: Date, default: null },
    verificationWindowStart: { type: Date, default: null },
    verificationSendsInWindow: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
