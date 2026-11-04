const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");
const role = process.env.PROBE_ROLE;
const root = "/app/uploads";

async function waitFor(name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(100);
  }
  throw Object.assign(new Error("PROBE_TIMEOUT"), { code: "PROBE_TIMEOUT" });
}

async function marker(name, value) {
  const target = `${root}/${name}.json`;
  await fs.writeFile(`${target}.tmp`, JSON.stringify(value));
  await fs.rename(`${target}.tmp`, target);
}

async function login(sequence) {
  const response = await fetch("http://gateway/api/v1/auth/login", {
    method: "POST",
    headers: {
      Origin: "http://gateway.test",
      "Content-Type": "application/json",
      // Different forged IPs must not reset this container's quota.
      "X-Forwarded-For": `203.0.113.${sequence}`,
      "X-Real-IP": `198.51.100.${sequence}`,
      Forwarded: `for=203.0.113.${sequence}`,
    },
    body: JSON.stringify({ email: "gateway@fixture.test", password: "short" }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  return { status: response.status, errorCode: body.error?.code };
}

async function main() {
  assert.ok(["A", "B"].includes(role));
  if (role === "B") {
    await waitFor("gateway-a-ready");
    const result = await login(200);
    await marker("gateway-b-result", result);
    assert.equal(result.status, 422, "Client B must retain its own quota.");
    console.log(JSON.stringify({ event: "gateway_client_b", status: "PASS" }));
    return;
  }
  await assert.rejects(fs.stat(`${root}/gateway-a-ready.json`), {
    code: "ENOENT",
  });
  for (let i = 1; i <= 15; i += 1) {
    assert.equal((await login(i)).status, 422);
  }
  await marker("gateway-a-ready", { ready: true });
  const other = await waitFor("gateway-b-result");
  assert.equal(
    other.status,
    422,
    "Two clients must not share the proxy's quota.",
  );
  const blocked = await login(16);
  assert.equal(
    blocked.status,
    429,
    "Forged headers must not bypass client A's quota.",
  );
  assert.equal(blocked.errorCode, "RATE_LIMITED");
  console.log(
    JSON.stringify({
      event: "gateway_acceptance",
      status: "PASS",
      independentClients: 2,
      forgedIpBypassBlocked: true,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "gateway_acceptance_failed",
      role,
      errorType: error.name || "Error",
    }),
  );
  process.exitCode = 1;
});
