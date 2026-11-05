import ListingDetailPage from "@/features/listings/ListingDetailPage";
import { getPublicListingData } from "@/lib/publicListingData";

export const dynamic = "force-dynamic";

export default async function ListingDetailRoute({ params }) {
  const { id } = await params;
  const { data, error } = await getPublicListingData(`/listings/${encodeURIComponent(id)}`);
  return <ListingDetailPage key={id} id={id} listing={data} error={error} />;
}
