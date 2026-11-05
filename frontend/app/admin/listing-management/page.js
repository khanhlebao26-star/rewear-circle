import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { ListingManagementPage } from "@/features/moderation/ListingManagementPage";

export default function AdminListingManagementRoute() {
  return (
    <WorkspaceAccess role="ADMIN">
      <ListingManagementPage />
    </WorkspaceAccess>
  );
}
