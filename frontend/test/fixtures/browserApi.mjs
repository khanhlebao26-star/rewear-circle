import { createServer } from "node:http";

const listing = {
  listingId: "000000000000000000000001",
  versionId: "000000000000000000000002",
  sellerId: "000000000000000000000003",
  title: "Áo linen xanh",
  category: "Áo",
  size: "M",
  condition: "Còn mới",
  price: 180000,
  imageIds: ["000000000000000000000004"],
  saleStatus: "AVAILABLE",
  canBuy: true,
  shipFrom: "Hà Nội",
  description: "Áo linen tay dài.",
};
const shoes = {
  ...listing,
  listingId: "000000000000000000000005",
  title: "Giày canvas trắng",
  category: "Giày",
  size: "39",
  imageIds: [],
};
const version = { ...listing, _id: listing.versionId, status: "APPROVED" };
const seller = { userId: listing.sellerId, displayName: "Người bán thử nghiệm" };
let adminHiddenReason = "";

createServer(async (request, response) => {
  const { pathname, searchParams } = new URL(request.url, "http://localhost");
  const send = (data, meta) => response
    .writeHead(200, { "Content-Type": "application/json" })
    .end(JSON.stringify({ data, meta }));

  if (pathname === "/") return send({});
  if (pathname === "/api/v1/me") {
    if (request.headers.cookie?.includes("mockAdmin=1")) {
      return send({ id: "admin", role: "ADMIN", displayName: "Admin thử nghiệm" });
    }
    return response.writeHead(401).end();
  }
  if (pathname === "/api/v1/me/notifications") return send([], { unread: 0 });
  if (pathname === "/api/v1/listings") {
    const data = [listing, shoes].filter((item) =>
      ["category", "size", "condition"].every((key) => !searchParams.has(key) || item[key] === searchParams.get(key)) &&
      item.title.toLowerCase().includes((searchParams.get("q") || "").toLowerCase()),
    );
    return send(data, { total: data.length, limit: 20 });
  }
  if (pathname === `/api/v1/listings/${listing.listingId}`) return send(listing);
  if (pathname === `/api/v1/media/${listing.imageIds[0]}`) {
    return response.writeHead(200, { "Content-Type": "image/svg+xml" })
      .end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>');
  }
  if (pathname === "/api/v1/admin/listings") {
    const visibility = adminHiddenReason ? "HIDDEN" : "PUBLIC";
    const matches = (!searchParams.has("visibility") || searchParams.get("visibility") === visibility) &&
      (!searchParams.has("reviewStatus") || searchParams.get("reviewStatus") === version.status) &&
      listing.title.toLowerCase().includes((searchParams.get("q") || "").toLowerCase());
    return send(matches ? [{ ...listing, sellerName: seller.displayName, reviewStatus: version.status, visibility }] : [], {
      total: matches ? 21 : 0,
      limit: 20,
    });
  }
  if (pathname === `/api/v1/admin/listing-versions/${version._id}`) {
    return send({ ...listing, seller, version, versions: [version], adminHidden: Boolean(adminHiddenReason), adminHiddenReason });
  }
  if (pathname === `/api/v1/admin/listings/${listing.listingId}/visibility` && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { action, reason } = JSON.parse(Buffer.concat(chunks));
    adminHiddenReason = action === "HIDE" ? reason : "";
    return send({ adminHidden: Boolean(adminHiddenReason) });
  }
  response.writeHead(404).end();
}).listen(Number(process.env.MOCK_API_PORT), "127.0.0.1");
