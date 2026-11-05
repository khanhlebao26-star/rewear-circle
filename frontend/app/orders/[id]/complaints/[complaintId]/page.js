import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ComplaintsPage } from "@/features/orders/ComplaintsPage";

export default async function OrdersByIdComplaintsByComplaintIdRoute({
  params,
}) {
  const { id, complaintId } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <ComplaintsPage id={id} sub={complaintId} />
    </WorkspaceAccess>
  );
}
