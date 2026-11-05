import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CheckoutDetailPage } from "@/features/checkout/CheckoutDetailPage";

export default async function CheckoutsByIdPaymentRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <CheckoutDetailPage id={id} mode="payment" />
    </WorkspaceAccess>
  );
}
