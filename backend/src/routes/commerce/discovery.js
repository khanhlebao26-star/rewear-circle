const router = require("express").Router();
const Listing = require("../../models/Listing");
const { success } = require("../../http/responses");
const { readDiscoveryQuery } = require("../../domain/discoveryRules");
const { problem, approvedVersion, approvedVisibleListingQuery } = require("../../domain/commerceRules");
const { checkId } = require("./request");

function discoveryPipeline({ page, limit, filters }) {
  return [
    { $match: approvedVisibleListingQuery({ saleStatus: "AVAILABLE" }) },
    {
      $addFields: {
        approvedVersion: {
          $first: {
            $filter: {
              input: { $ifNull: ["$versions", []] },
              as: "version",
              cond: { $eq: ["$$version._id", "$approvedVersionId"] },
            },
          },
        },
      },
    },
    { $match: { "approvedVersion.status": "APPROVED", ...filters } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              listingId: "$_id",
              versionId: "$approvedVersion._id",
              sellerId: "$ownerId",
              title: "$approvedVersion.title",
              category: "$approvedVersion.category",
              size: "$approvedVersion.size",
              condition: "$approvedVersion.condition",
              price: "$approvedVersion.price",
              imageIds: "$approvedVersion.imageIds",
              saleStatus: 1,
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];
}

// Danh sách tin đã duyệt và có thể mua.
router.get("/listings", async (req, res) => {
  const query = readDiscoveryQuery(req.query);
  if (!query)
    throw problem(
      422,
      "VALIDATION_ERROR",
      "Tham số tìm kiếm hoặc phân trang không hợp lệ.",
    );
  const [result] = await Listing.aggregate(discoveryPipeline(query));
  return success(req, res, result?.items || [], 200, {
    page: query.page,
    limit: query.limit,
    total: result?.total?.[0]?.count || 0,
    serverNow: new Date().toISOString(),
  });
});

router.get("/listings/:id", async (req, res) => {
  checkId(req.params.id);
  const listing = await Listing.findById(req.params.id);
  const version = approvedVersion(listing);
  if (
    !listing ||
    !version ||
    !["AVAILABLE", "RESERVED", "SOLD"].includes(listing.saleStatus)
  ) {
    throw problem(404, "NOT_FOUND", "Không tìm thấy tin.");
  }

  return success(
    req,
    res,
    {
      listingId: String(listing._id),
      versionId: String(version._id),
      sellerId: String(listing.ownerId),
      title: version.title,
      category: version.category,
      size: version.size,
      condition: version.condition,
      description: version.description,
      flaws: version.flaws,
      price: version.price,
      shipFrom: version.shipFrom,
      imageIds: version.imageIds,
      saleStatus: listing.saleStatus,
      canBuy: listing.saleStatus === "AVAILABLE",
      watermark: listing.saleStatus === "SOLD" ? "Đã bán" : null,
      createdAt: listing.createdAt,
    },
    200,
    { serverNow: new Date().toISOString() },
  );
});

module.exports = router;
