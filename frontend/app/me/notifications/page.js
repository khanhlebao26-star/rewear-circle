import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { NotificationsPage } from "@/features/account/NotificationsPage";

export default function MeNotificationsRoute() {
  return (
    <WorkspaceAccess role={null}>
      <NotificationsPage />
    </WorkspaceAccess>
  );
}
