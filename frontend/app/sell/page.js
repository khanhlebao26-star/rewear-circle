import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { ListingEditorPage } from "@/features/seller/ListingEditorPage";

export default function SellRoute() {
  return (
    <WorkspaceAccess verifyEmail>
      <ListingEditorPage />
    </WorkspaceAccess>
  );
}
