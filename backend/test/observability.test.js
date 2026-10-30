const test = require("node:test");
const assert = require("node:assert/strict");

test("HTTP logs use the matched route template and omit query values", async () => {
  const express = require("express");
  const requestLogger = require("../src/http/requestLogger");
  const app = express();
  app.use(requestLogger);
  app.get("/health/live", (req, res) => res.status(200).json({ status: "live" }));
  app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  const captured = [];
  const originalLog = console.log;
  const server = app.listen(0);
  console.log = (line) => captured.push(line);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health/live?token=private-test-value`);
    assert.equal(response.status, 200);
    const requestId = response.headers.get("x-request-id");
    assert.ok(requestId);

    const log = JSON.parse(captured.find((line) => line.includes(requestId)));
    assert.equal(log.event, "http_request");
    assert.equal(log.route, "/health/live");
    assert.equal(log.method, "GET");
    assert.equal(log.statusCode, 200);
    assert.equal(typeof log.durationMs, "number");
    assert.equal(JSON.stringify(log).includes("private-test-value"), false);
  } finally {
    console.log = originalLog;
    await new Promise((resolve) => server.close(resolve));
  }
});
