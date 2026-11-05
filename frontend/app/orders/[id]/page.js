import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { OrderDetailPage } from "@/features/orders/OrderDetailPage";

export default async function OrdersByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <OrderDetailPage id={id} />
    </WorkspaceAccess>
  );
}
