const categories = {
  "Áo": ["XS", "S", "M", "L", "XL", "XXL"],
  "Quần": ["XS", "S", "M", "L", "XL", "XXL"],
  "Giày": Array.from({ length: 11 }, (_, index) => String(index + 35)),
  "Phụ kiện": ["FREE_SIZE"],
};

function readDiscoveryQuery(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const allowed = new Set(["page", "limit", "q", "category", "size", "condition", "minPrice", "maxPrice"]);
  if (
    Object.keys(query).some((key) => !allowed.has(key)) ||
    !Number.isInteger(page) || page < 1 ||
    !Number.isInteger(limit) || limit < 1 || limit > 100
  ) return null;

  const filters = {};
  if (query.q !== undefined) {
    if (typeof query.q !== "string" || !query.q.trim() || query.q.trim().length > 100) return null;
    const symbols = new Set(".*+?^${}()|[]\\".split(""));
    const escaped = [...query.q.trim()]
      .map((character) => symbols.has(character) ? `\\${character}` : character)
      .join("");
    filters.$or = [
      { "approvedVersion.title": { $regex: escaped, $options: "i" } },
      { "approvedVersion.description": { $regex: escaped, $options: "i" } },
    ];
  }
  if (query.category !== undefined) {
    if (!Object.hasOwn(categories, query.category)) return null;
    filters["approvedVersion.category"] = query.category;
  }
  if (query.size !== undefined) {
    if (typeof query.size !== "string" || !query.size.trim() || query.size.length > 20) return null;
    if (query.category && !categories[query.category].includes(query.size)) return null;
    filters["approvedVersion.size"] = query.size;
  }
  if (query.condition !== undefined) {
    if (typeof query.condition !== "string" || !query.condition.trim() || query.condition.length > 40) return null;
    filters["approvedVersion.condition"] = query.condition.trim();
  }

  for (const key of ["minPrice", "maxPrice"]) {
    if (query[key] === undefined) continue;
    if (!/^\d+$/.test(String(query[key]))) return null;
    const value = Number(query[key]);
    if (!Number.isInteger(value) || value < 20000 || value > 5000000) return null;
    filters["approvedVersion.price"] = {
      ...filters["approvedVersion.price"],
      [key === "minPrice" ? "$gte" : "$lte"]: value,
    };
  }
  if (
    query.minPrice !== undefined && query.maxPrice !== undefined &&
    Number(query.minPrice) > Number(query.maxPrice)
  ) return null;

  return { page, limit, filters };
}

module.exports = { readDiscoveryQuery };
