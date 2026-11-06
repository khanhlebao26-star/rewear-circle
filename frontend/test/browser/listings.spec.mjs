import { expect, test } from "@playwright/test";

test("guest sees server-rendered listings, can filter and opens the original only on zoom", async ({ page, request }) => {
  const response = await request.get("/listings");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/<h3><a[^>]+>Áo linen xanh<\/a><\/h3>/);

  await page.goto("/listings");
  const catalog = page.getByRole("main");
  await expect(catalog.getByRole("link", { name: "Giày canvas trắng", exact: true })).toBeVisible();
  await catalog.getByRole("link", { name: "Áo", exact: true }).click();
  await expect(catalog.getByRole("heading", { name: "Áo", exact: true })).toBeVisible();
  await catalog.getByRole("textbox", { name: "Tìm tên hoặc mô tả" }).fill("linen");
  await catalog.getByRole("combobox", { name: "Kích cỡ" }).selectOption("M");
  await catalog.getByRole("button", { name: "Tìm đồ" }).click();
  await expect(page).toHaveURL(/q=linen.*size=M/);
  await expect(catalog.getByRole("link", { name: "Giày canvas trắng", exact: true })).toHaveCount(0);

  const imageRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/media/")) imageRequests.push(url);
  });
  await catalog.getByRole("link", { name: "Áo linen xanh", exact: true }).click();
  const zoom = page.getByRole("button", { name: "Phóng to ảnh Áo linen xanh" });
  await expect(zoom.getByRole("img")).toHaveAttribute("srcset", /width=640 640w, .*width=1280 1280w/);
  await expect.poll(() => imageRequests.some((url) => ["640", "1280"].includes(url.searchParams.get("width")))).toBe(true);
  expect(imageRequests.every((url) => url.searchParams.has("width"))).toBe(true);
  const original = page.waitForRequest((request) => /\/api\/v1\/media\/\w+$/.test(request.url()));
  await zoom.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await original;
});

test("admin returns to the same filters and page and keeps details visible during a refresh", async ({ context, page }) => {
  await context.addCookies([{ name: "mockAdmin", value: "1", url: "http://127.0.0.1:3199" }]);
  await page.goto("/admin/listing-management");
  await expect(page.getByText("Áo linen xanh", { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm tin đăng" }).fill("linen");
  await page.getByRole("combobox", { name: "Trạng thái duyệt" }).selectOption("APPROVED");
  await page.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/q=linen&reviewStatus=APPROVED$/);
  await page.getByRole("button", { name: "Tiếp" }).click();
  await expect(page).toHaveURL(/page=2$/);
  await page.getByRole("link", { name: /Xem chi tiết/ }).click();
  const heading = page.getByRole("heading", { name: "Áo linen xanh", exact: true });
  await expect(heading).toBeVisible();

  const refreshGate = Promise.withResolvers();
  await page.route("**/api/v1/admin/listing-versions/*", async (route) => {
    await refreshGate.promise;
    await route.continue();
  });
  const hide = page.getByRole("button", { name: "Ẩn tin (Admin)" });
  try {
    await hide.click();
    await page.getByRole("textbox", { name: "Lý do kiểm duyệt *" }).fill("Kiểm thử cập nhật trạng thái");
    await page.getByRole("button", { name: "Lưu trạng thái tin" }).click();
    await expect(page.getByRole("status")).toHaveText("Đang cập nhật…");
    await expect(heading).toBeVisible();
    await expect(hide).toBeDisabled();
  } finally {
    refreshGate.resolve();
  }
  await expect(page.getByText("Admin đã ẩn", { exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Quản lý tin đăng", exact: true }).click();
  await expect(page).toHaveURL(/q=linen&reviewStatus=APPROVED&page=2$/);
  await expect(page.getByRole("searchbox", { name: "Tìm tin đăng" })).toHaveValue("linen");
  await expect(page.getByRole("navigation", { name: "Phân trang" })).toContainText("Trang 2 / 2");
  await expect(page.getByRole("table").getByText("Đã ẩn", { exact: true })).toBeVisible();
});
