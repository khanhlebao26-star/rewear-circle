import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CartPage } from "@/features/checkout/CartPage";

export default function CheckoutRoute() {
  return (
    <WorkspaceAccess plain verifyEmail>
      <CartPage checkout />
    </WorkspaceAccess>
  );
}
