import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CodCollectionsPage } from "@/features/moderation/CodCollectionsPage";

export default function AdminCodCollectionsRoute() {
  return (
    <WorkspaceAccess role="ADMIN">
      <CodCollectionsPage />
    </WorkspaceAccess>
  );
}
