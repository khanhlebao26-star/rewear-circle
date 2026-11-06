const router = require("express").Router();
const mongoose = require("mongoose");
const Notification = require("../../models/Notification");
const { requireAuth } = require("../../middleware/requireAuth");
const { success, failure: fail } = require("../../http/responses");
const { readPagination } = require("../../http/readPagination");

function notificationDTO(notification) {
  return {
    notificationId: String(notification._id),
    type: notification.type,
    listingId: notification.listingId ? String(notification.listingId) : null,
    orderId: notification.orderId ? String(notification.orderId) : null,
    versionId: notification.versionId ? String(notification.versionId) : null,
    reportId: notification.reportId ? String(notification.reportId) : null,
    complaintId: notification.complaintId
      ? String(notification.complaintId)
      : null,
    caseId: notification.caseId ? String(notification.caseId) : null,
    message: notification.message,
    ...(notification.type.startsWith("LISTING_")
      ? { reason: notification.reason }
      : {}),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

router.get("/me/notifications", requireAuth, async (req, res) => {
  const pagination = readPagination(req.query);
  if (!pagination) {
    return fail(req, res, 422, "VALIDATION_ERROR", "page/limit không hợp lệ.");
  }

  const { page, limit } = pagination;
  const filter = { recipientId: req.user._id };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);

  res.set("Cache-Control", "private, no-store");
  return success(req, res, items.map(notificationDTO), 200, {
    page,
    limit,
    total,
    unread,
  });
});

router.patch("/me/notifications/:id/read", requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy thông báo.");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!notification) {
    const alreadyRead = await Notification.findOne({
      _id: req.params.id,
      recipientId: req.user._id,
    });
    if (!alreadyRead)
      return fail(req, res, 404, "NOT_FOUND", "Không tìm thấy thông báo.");
    res.set("Cache-Control", "private, no-store");
    return success(req, res, notificationDTO(alreadyRead));
  }

  res.set("Cache-Control", "private, no-store");
  return success(req, res, notificationDTO(notification));
});

module.exports = router;
