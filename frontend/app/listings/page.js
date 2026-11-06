import CatalogPage from "@/features/listings/CatalogPage";
import { catalogFilterNames, listingSearchParams, readListingSearch } from "@/lib/listingSearch.mjs";
import { getPublicListingData } from "@/lib/publicListingData";

export const metadata = { title: "Khám phá món đồ — Rewear Circle" };

export default async function Listings({ searchParams }) {
  const { filters, page } = readListingSearch(await searchParams, catalogFilterNames);
  const params = listingSearchParams(filters, page);
  params.set("limit", "20");
  const results = await getPublicListingData(`/listings?${params}`);
  return <CatalogPage values={filters} page={page} results={results} />;
}
