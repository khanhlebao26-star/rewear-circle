import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ListingReviewPage } from "@/features/moderation/ListingReviewPage";
import { listingSearchParams, managementFilterNames, readListingSearch, withListingSearch } from "@/lib/listingSearch.mjs";

export default async function AdminListingManagementDetailRoute({ params, searchParams }) {
  const { id } = await readRecordParams(params);
  const { filters, page } = readListingSearch(await searchParams, managementFilterNames);
  const backHref = withListingSearch("/admin/listing-management", listingSearchParams(filters, page));
  return (
    <WorkspaceAccess role="ADMIN">
      <ListingReviewPage id={id} managementBackHref={backHref} />
    </WorkspaceAccess>
  );
}
