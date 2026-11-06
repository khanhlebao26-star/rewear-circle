export const catalogFilterNames = ["q", "category", "size", "condition", "minPrice", "maxPrice"];
export const managementFilterNames = ["q", "reviewStatus", "visibility"];

export function readListingSearch(query, filterNames) {
  const filters = Object.fromEntries(
    filterNames.map((name) => [name, typeof query[name] === "string" ? query[name] : ""]),
  );
  const requestedPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return { filters, page };
}

export function listingSearchParams(filters, page = 1) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value.trim()) params.set(name, value.trim());
  }
  if (page > 1) params.set("page", String(page));
  return params;
}

export function withListingSearch(path, params) {
  return params.size ? `${path}?${params}` : path;
}
