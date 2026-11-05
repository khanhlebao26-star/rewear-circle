import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CaseDetailPage } from "@/features/moderation/CaseDetailPage";

export default async function SupportCasesByIdRoute({ params }) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess role="SUPPORT">
      <CaseDetailPage id={id} support />
    </WorkspaceAccess>
  );
}
