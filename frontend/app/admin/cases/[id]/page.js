import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CaseDetailPage } from "@/features/moderation/CaseDetailPage";

export default async function AdminCasesByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess role="ADMIN">
      <CaseDetailPage id={id} />
    </WorkspaceAccess>
  );
}
