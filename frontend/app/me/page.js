import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { ProfilePage } from "@/features/account/ProfilePage";

export default function MeRoute() {
  return (
    <WorkspaceAccess role={null}>
      <ProfilePage />
    </WorkspaceAccess>
  );
}
