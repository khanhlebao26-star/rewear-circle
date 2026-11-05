import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CheckoutDetailPage } from "@/features/checkout/CheckoutDetailPage";

export default async function CheckoutsByIdSuccessRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess plain>
      <CheckoutDetailPage id={id} mode="success" />
    </WorkspaceAccess>
  );
}
