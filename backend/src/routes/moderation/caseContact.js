const router = require("express").Router();
const { validId } = require("../../domain/commerceRules");
const { requireAuth, requireAdmin, requireSupport } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");
const { readContactAccess } = require("../../services/caseAccess");

function readContactReason(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof body.reason !== "string"
  )
    return null;
  const reason = body.reason.trim();
  if (
    reason.length < 10 ||
    reason.length > 500 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(reason) ||
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(reason) ||
    /\+?\d[\d\s().-]{7,}\d/.test(reason)
  )
    return null;
  return reason;
}

router.post(
  "/support/cases/:caseId/contact-access",
  requireAuth,
  requireSupport,
  async (req, res) => {
    if (!validId(req.params.caseId))
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    const reason = readContactReason(req.body);
    if (!reason)
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Lý do truy cập không hợp lệ.",
      );
    const data = await readContactAccess({
      caseId: req.params.caseId,
      userId: req.user._id,
      role: "SUPPORT",
      reason,
      requestId: req.requestId,
    });
    res.set("Cache-Control", "private, no-store");
    return success(req, res, data);
  },
);

router.post(
  "/admin/cases/:caseId/contact-access",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!validId(req.params.caseId))
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy vụ việc.");
    const reason = readContactReason(req.body);
    if (!reason)
      return fail(
        req,
        res,
        422,
        "VALIDATION_ERROR",
        "Lý do truy cập không hợp lệ.",
      );
    const data = await readContactAccess({
      caseId: req.params.caseId,
      userId: req.user._id,
      role: "ADMIN",
      reason,
      requestId: req.requestId,
    });
    res.set("Cache-Control", "private, no-store");
    return success(req, res, data);
  },
);

module.exports = router;
