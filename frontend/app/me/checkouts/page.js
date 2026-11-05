import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CheckoutHistoryPage } from "@/features/checkout/CheckoutHistoryPage";

export default function MeCheckoutsRoute() {
  return (
    <WorkspaceAccess>
      <CheckoutHistoryPage />
    </WorkspaceAccess>
  );
}
