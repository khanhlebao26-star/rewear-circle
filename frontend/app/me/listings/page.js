import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { SellerClosetPage } from "@/features/seller/SellerClosetPage";

export default function MeListingsRoute() {
  return (
    <WorkspaceAccess>
      <SellerClosetPage />
    </WorkspaceAccess>
  );
}
