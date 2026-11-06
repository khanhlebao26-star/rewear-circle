import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ComplaintListPage } from "@/features/orders/complaints/ComplaintListPage";

export default async function OrdersByIdComplaintsRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <ComplaintListPage id={id} />
    </WorkspaceAccess>
  );
}
