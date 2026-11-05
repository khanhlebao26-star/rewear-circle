import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ListingReportPage } from "@/features/listings/ListingReportPage";

export default async function ListingsByIdReportRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess plain verifyEmail>
      <ListingReportPage id={id} />
    </WorkspaceAccess>
  );
}
