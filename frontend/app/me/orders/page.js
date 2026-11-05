import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { OrdersPage } from "@/features/orders/OrdersPage";

export default function MeOrdersRoute() {
  return (
    <WorkspaceAccess>
      <OrdersPage />
    </WorkspaceAccess>
  );
}
