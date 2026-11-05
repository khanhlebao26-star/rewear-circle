import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CasesPage } from "@/features/moderation/CasesPage";

export default function AdminCasesRoute() {
  return (
    <WorkspaceAccess role="ADMIN">
      <CasesPage />
    </WorkspaceAccess>
  );
}
