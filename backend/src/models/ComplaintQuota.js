const mongoose = require("mongoose");

const complaintQuotaSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    recentSubmissions: { type: [Date], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

module.exports = mongoose.model("ComplaintQuota", complaintQuotaSchema);
