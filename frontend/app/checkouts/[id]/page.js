import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CheckoutDetailPage } from "@/features/checkout/CheckoutDetailPage";

export default async function CheckoutsByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess>
      <CheckoutDetailPage id={id} />
    </WorkspaceAccess>
  );
}
