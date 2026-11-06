import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ComplaintDetailPage } from "@/features/orders/complaints/ComplaintDetailPage";

export default async function OrdersByIdComplaintsByComplaintIdRoute({
  params,
}) {
  const { id, complaintId } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <ComplaintDetailPage id={id} complaintId={complaintId} />
    </WorkspaceAccess>
  );
}
