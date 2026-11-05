import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { CodReturnsPage } from "@/features/moderation/CodReturnsPage";

export default async function AdminCodReturnsRoute({ searchParams }) {
  return (
    <WorkspaceAccess role="ADMIN">
      <CodReturnsPage query={await searchParams} />
    </WorkspaceAccess>
  );
}
