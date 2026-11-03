function success(req, res, data, status = 200, meta = {}) {
  return res.status(status).json({
    data,
    meta: { requestId: req.requestId, ...meta },
  });
}

function failure(req, res, status, code, message) {
  return res.status(status).json({
    error: { code, message, retryable: false },
    meta: { requestId: req.requestId },
  });
}

module.exports = { success, failure };
