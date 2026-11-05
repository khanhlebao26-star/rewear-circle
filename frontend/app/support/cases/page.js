import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CasesPage } from "@/features/moderation/CasesPage";

export default function SupportCasesRoute() {
  return (
    <WorkspaceAccess role="SUPPORT">
      <CasesPage support />
    </WorkspaceAccess>
  );
}
