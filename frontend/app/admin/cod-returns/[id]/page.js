import WorkspaceAccess from "@/components/layout/WorkspaceAccess";
import { readRecordParams } from "@/lib/recordParams";
import { CodReturnsPage } from "@/features/moderation/CodReturnsPage";

export default async function AdminCodReturnsByIdRoute({
  params,
  searchParams,
}) {
  const { id } = await readRecordParams(params);
  return (
    <WorkspaceAccess role="ADMIN">
      <CodReturnsPage id={id} query={await searchParams} />
    </WorkspaceAccess>
  );
}
