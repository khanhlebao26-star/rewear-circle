import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { ListingManagementPage } from "@/features/moderation/ListingManagementPage";
import { managementFilterNames, readListingSearch } from "@/lib/listingSearch.mjs";

export default async function AdminListingManagementRoute({ searchParams }) {
  const { filters, page } = readListingSearch(await searchParams, managementFilterNames);
  return (
    <WorkspaceAccess role="ADMIN">
      <ListingManagementPage filters={filters} page={page} />
    </WorkspaceAccess>
  );
}
