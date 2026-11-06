const router = require("express").Router();
const Report = require("../../models/Report");
const Case = require("../../models/Case");
const Complaint = require("../../models/Complaint");
const { validId } = require("../../domain/commerceRules");
const { requireAuth, requireSupport } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");
const { supportCaseDetail } = require("../../services/caseAccess");
const { readPagination: pagination } = require("../../http/readPagination");

router.get("/support/cases", requireAuth, requireSupport, async (req, res) => {
  const pageInfo = pagination(req.query);
  const type = req.query.type;
  const status = req.query.status;
  if (
    !pageInfo ||
    Object.keys(req.query).some(
      (key) => !["type", "status", "page", "limit"].includes(key),
    ) ||
    (type !== undefined && !["REPORT", "DELIVERY", "ITEM"].includes(type)) ||
    (status !== undefined && !["OPEN", "IN_REVIEW"].includes(status))
  ) {
    return fail(
      req,
      res,
      422,
      "VALIDATION_ERROR",
      "Bộ lọc hoặc phân trang không hợp lệ.",
    );
  }
  const filter = {
    assignedSupportId: req.user._id,
    status: status || { $in: ["OPEN", "IN_REVIEW"] },
    ...(type ? { type } : {}),
  };
  const cases = await Case.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .skip((pageInfo.page - 1) * pageInfo.limit)
    .limit(pageInfo.limit)
    .select(
      "type targetType targetId status version assignedSupportId createdAt updatedAt closedAt outcomeCode outcomeSummary",
    )
    .lean();
  const total = await Case.countDocuments(filter);
  const caseIds = cases.map((caseRecord) => caseRecord._id);
  const [reportCounts, complaintCounts] = caseIds.length
    ? await Promise.all([
        Report.aggregate([
          { $match: { caseId: { $in: caseIds } } },
          { $group: { _id: "$caseId", count: { $sum: 1 } } },
        ]),
        Complaint.aggregate([
          { $match: { caseId: { $in: caseIds } } },
          { $group: { _id: "$caseId", count: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const reportCountByCase = new Map(
    reportCounts.map((record) => [String(record._id), record.count]),
  );
  const complaintCountByCase = new Map(
    complaintCounts.map((record) => [String(record._id), record.count]),
  );
  res.set("Cache-Control", "private, no-store");
  return success(
    req,
    res,
    cases.map((caseRecord) => ({
      caseId: String(caseRecord._id),
      type: caseRecord.type,
      targetType: caseRecord.targetType,
      targetId: String(caseRecord.targetId),
      status: caseRecord.status,
      version: caseRecord.version,
      assignedSupportId: String(caseRecord.assignedSupportId),
      reportCount: reportCountByCase.get(String(caseRecord._id)) || 0,
      complaintCount: complaintCountByCase.get(String(caseRecord._id)) || 0,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      closedAt: caseRecord.closedAt,
      outcomeCode: caseRecord.outcomeCode,
      outcomeSummary: caseRecord.outcomeSummary,
    })),
    200,
    { page: pageInfo.page, limit: pageInfo.limit, total },
  );
});

router.get(
  "/support/cases/:caseId",
  requireAuth,
  requireSupport,
  async (req, res) => {
    if (!validId(req.params.caseId))
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    const data = await supportCaseDetail({
      caseId: req.params.caseId,
      userId: req.user._id,
      requestId: req.requestId,
    });
    res.set("Cache-Control", "private, no-store");
    return success(req, res, data);
  },
);

module.exports = router;
