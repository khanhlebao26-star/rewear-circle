import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { ComplaintsPage } from "@/features/orders/ComplaintsPage";

export default async function OrdersByIdComplaintsNewRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <ComplaintsPage id={id} sub="new" />
    </WorkspaceAccess>
  );
}
