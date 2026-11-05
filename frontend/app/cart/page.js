import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CartPage } from "@/features/checkout/CartPage";

export default function CartRoute() {
  return (
    <WorkspaceAccess plain>
      <CartPage />
    </WorkspaceAccess>
  );
}
