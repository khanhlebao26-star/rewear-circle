"use client";

import { useMutation } from "@/hooks/useMutation";
import { ErrorState } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";

export function CaseAssignmentForm({ record, reload }) {
  const mutation = useMutation();
  async function submit(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget)
      .get("assignedSupportId")
      .trim();
    if (
      await mutation.run(
        `/admin/cases/${record.caseId}/assignment`,
        { assignedSupportId: value || null, expectedVersion: record.version },
        "PATCH",
      )
    )
      reload();
  }
  return (
    <form className="panel" onSubmit={submit}>
      <p className="eyebrow">PHÂN CÔNG HỖ TRỢ</p>
      <h3>Giao hoặc gỡ người hỗ trợ</h3>
      {mutation.error && <ErrorState error={mutation.error} reload={reload} />}
      <Field
        label="Mã tài khoản Support"
        name="assignedSupportId"
        key={record.version}
        defaultValue={record.assignedSupportId || ""}
        pattern="[a-fA-F0-9]{24}"
        maxLength={24}
        help="Nhập mã tài khoản Support có sẵn. Để trống để gỡ phân công."
      />
      <button className="btn secondary full" disabled={mutation.pending}>
        Lưu phân công
      </button>
    </form>
  );
}
