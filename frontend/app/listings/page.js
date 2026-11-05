import CatalogPage from "@/features/listings/CatalogPage";

export const metadata = { title: "Khám phá món đồ — Rewear Circle" };
export default async function Listings({ searchParams }) {
  return <CatalogPage query={await searchParams} />;
}
