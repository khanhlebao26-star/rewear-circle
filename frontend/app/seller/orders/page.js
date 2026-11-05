import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { OrdersPage } from "@/features/orders/OrdersPage";

export default function SellerOrdersRoute() {
  return (
    <WorkspaceAccess>
      <OrdersPage selling />
    </WorkspaceAccess>
  );
}
