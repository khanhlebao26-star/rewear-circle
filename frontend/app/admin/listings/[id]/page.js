import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ListingReviewPage } from "@/features/moderation/ListingReviewPage";

export default async function AdminListingsByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess role="ADMIN">
      <ListingReviewPage id={id} />
    </WorkspaceAccess>
  );
}
