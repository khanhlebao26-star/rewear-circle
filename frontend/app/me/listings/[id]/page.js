import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ManageListingPage } from "@/features/seller/ManageListingPage";

export default async function MeListingsByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <ManageListingPage id={id} />
    </WorkspaceAccess>
  );
}
