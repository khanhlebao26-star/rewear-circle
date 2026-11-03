const { randomUUID } = require("node:crypto");

module.exports = function requestLogger(req, res, next) {
  req.requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  res.setHeader("X-Request-Id", req.requestId);
  res.on("finish", () => {
    const routePath = req.route?.path;
    const route = `${req.baseUrl || ""}${typeof routePath === "string" ? routePath : "UNMATCHED"}`;
    const statusCode = res.statusCode;
    console.log(JSON.stringify({
      event: "http_request",
      level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
      requestId: req.requestId,
      method: req.method,
      route,
      statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      ...(req.errorCode ? { errorCode: req.errorCode } : {}),
    }));
  });
  next();
};
