import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { ListingReviewPage } from "@/features/moderation/ListingReviewPage";

export default function AdminListingsRoute() {
  return (
    <WorkspaceAccess role="ADMIN">
      <ListingReviewPage />
    </WorkspaceAccess>
  );
}
