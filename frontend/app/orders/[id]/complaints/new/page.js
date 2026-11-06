import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { NewComplaintPage } from "@/features/orders/complaints/NewComplaintPage";

export default async function OrdersByIdComplaintsNewRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <NewComplaintPage id={id} />
    </WorkspaceAccess>
  );
}
