import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import {
  api,
  categories,
  checkoutPayload,
  complaintPayload,
} from "../lib/api.mjs";
import { isRecordId, notificationTarget, safeNext } from "../lib/routes.mjs";
const require = createRequire(import.meta.url);
const {
  readComplaintInput,
} = require("../../backend/src/domain/moderationRules.js");
const {
  readDiscoveryQuery,
} = require("../../backend/src/domain/discoveryRules.js");
const id = "100000000000000000000001";
test("wardrobe illustration is valid as a standalone SVG image", () => {
  assert.match(
    readFileSync(
      new URL("../public/hero-wardrobe.svg", import.meta.url),
      "utf8",
    ),
    /<svg\s[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/,
  );
});

test("account, commerce and staff routes have explicit pages and valid record parameters", () => {
  const routeDirectories = [
    "login",
    "register",
    "verify-email",
    "me",
    "me/notifications",
    "cart",
    "checkout",
    "me/checkouts",
    "checkouts/[id]",
    "checkouts/[id]/payment",
    "checkouts/[id]/success",
    "me/orders",
    "seller/orders",
    "orders/[id]",
    "seller/orders/[id]",
    "orders/[id]/complaints",
    "orders/[id]/complaints/new",
    "orders/[id]/complaints/[complaintId]",
    "listings/[id]/report",
    "sell",
    "me/listings",
    "me/listings/[id]",
    "me/listings/[id]/edit",
    "me/listings/[id]/revisions",
    "admin/listings",
    "admin/listings/[id]",
    "admin/cases",
    "admin/cases/[id]",
    "support/cases",
    "support/cases/[id]",
    "admin/cod-collections",
    "admin/cod-returns",
    "admin/cod-returns/[id]",
  ];
  for (const route of routeDirectories) {
    assert.ok(existsSync(new URL(`../app/${route}/page.js`, import.meta.url)), route);
  }
  assert.equal(isRecordId(id), true);
  for (const invalid of [
    null,
    [id],
    "not-an-id",
    "f".repeat(23),
    "F".repeat(24),
  ]) {
    assert.equal(isRecordId(invalid), false);
  }
});

test("login returns only to a local safe destination", () => {
  for (const path of [
    "//outside.example",
    "https://outside.example",
    "/\\outside.example",
    "/login?next=/me",
    "/register",
    "/\noutside.example",
  ])
    assert.equal(safeNext(path), "/me");
  assert.equal(safeNext(`/orders/${id}`), `/orders/${id}`);
  assert.equal(safeNext(undefined, "/admin/cases"), "/admin/cases");
});
test("notifications open the user's own complaint history and role-appropriate screens", () => {
  assert.equal(
    notificationTarget({ orderId: id, caseId: id }, "USER"),
    `/orders/${id}/complaints`,
  );
  assert.equal(
    notificationTarget({ orderId: id, complaintId: id }, "USER"),
    `/orders/${id}/complaints/${id}`,
  );
  assert.equal(
    notificationTarget({ caseId: id }, "SUPPORT"),
    `/support/cases/${id}`,
  );
  assert.equal(
    notificationTarget({ listingId: id, type: "LISTING_APPROVED" }, "USER"),
    `/me/listings/${id}`,
  );
  assert.equal(
    notificationTarget({ listingId: id, type: "REPORT_RECEIVED" }, "USER"),
    `/listings/${id}`,
  );
});

test("checkout sends current price/version and receiver fields only", () => {
  const result = checkoutPayload(
    [
      {
        listingId: id,
        versionId: "200000000000000000000001",
        price: 185000,
        sellerId: "ignored",
        availability: "AVAILABLE",
      },
    ],
    {
      fullName: " Người nhận ",
      phone: " 0901234567 ",
      address: " Địa chỉ nhận hàng mẫu ",
      buyerId: "ignored",
    },
  );
  assert.deepEqual(result, {
    items: [
      {
        listingId: id,
        expectedPrice: 185000,
        expectedVersionId: "200000000000000000000001",
      },
    ],
    paymentMethod: "COD",
    recipientName: "Người nhận",
    recipientPhone: "0901234567",
    recipientAddress: "Địa chỉ nhận hàng mẫu",
  });
});

test("complaint bodies match the backend distinction between delivery and item", () => {
  const delivery = complaintPayload(
    "DELIVERY",
    "NOT_RECEIVED",
    " Chưa nhận hàng sau thời gian chờ ",
    [],
    [id],
  );
  assert.equal(Object.hasOwn(delivery, "affectedOrderItemIds"), false);
  assert.ok(readComplaintInput(delivery));
  assert.ok(
    readComplaintInput(
      complaintPayload(
        "ITEM",
        "WRONG_ITEM",
        "Món nhận khác mô tả trong đơn",
        [],
        [id],
      ),
    ),
  );
  assert.equal(
    readComplaintInput(
      complaintPayload(
        "ITEM",
        "WRONG_ITEM",
        "Món nhận khác mô tả trong đơn",
        [],
        [],
      ),
    ),
    null,
  );
});

test("category/size filter options conform to existing discovery rules", () => {
  for (const [category, sizes] of Object.entries(categories))
    for (const size of sizes) assert.ok(readDiscoveryQuery({ category, size }));
  assert.equal(readDiscoveryQuery({ category: "Giày", size: "M" }), null);
});

test("API preserves sessions, idempotency and structured errors", async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, ...options });
      return new Response(JSON.stringify({ data: { ok: true } }), {
        headers: { "Content-Type": "application/json" },
      });
    };
    await api("/checkouts", {
      method: "POST",
      body: { paymentMethod: "COD" },
      key: "same-request",
    });
    assert.equal(calls[0].credentials, "same-origin");
    assert.equal(calls[0].cache, "no-store");
    assert.equal(calls[0].headers["Idempotency-Key"], "same-request");
    assert.equal(calls[0].url, "/api/v1/checkouts");
    const body = new FormData();
    body.append("purpose", "LISTING");
    await api("/media/upload-requests", { method: "POST", body });
    assert.equal(Object.hasOwn(calls[1].headers, "Content-Type"), false);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: "EMAIL_NOT_VERIFIED", message: "Cần xác minh email" },
        }),
        { status: 403 },
      );
    await assert.rejects(
      api("/cart"),
      (error) =>
        error.status === 403 &&
        error.code === "EMAIL_NOT_VERIFIED" &&
        error.message === "Cần xác minh email",
    );
  } finally {
    globalThis.fetch = original;
  }
});
