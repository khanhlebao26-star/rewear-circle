"use client";

import { useState } from "react";
import { useMutation } from "@/hooks/useMutation";
import { ErrorState } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";

export function CaseDecisionForm({ record, reload }) {
  const mutation = useMutation();
  const [outcome, setOutcome] = useState("");
  const report = record.type === "REPORT";
  async function submit(event) {
    event.preventDefault();
    if (record.status !== "IN_REVIEW") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      status: "CLOSED",
      expectedVersion: record.version,
      outcomeCode: outcome,
      outcomeSummary: form.get("summary").trim(),
      internalNote: form.get("internalNote").trim(),
    };
    if (report && form.get("listingAction"))
      payload.listingAction = form.get("listingAction");
    if (await mutation.run(`/admin/cases/${record.caseId}/decisions`, payload))
      reload();
  }
  async function start() {
    if (
      await mutation.run(`/admin/cases/${record.caseId}/decisions`, {
        status: "IN_REVIEW",
        expectedVersion: record.version,
      })
    )
      reload();
  }
  return (
    <form className="panel" onSubmit={submit}>
      <p className="eyebrow">XỬ LÝ VỤ VIỆC</p>
      <h2>Quyết định cuối cùng.</h2>
      {mutation.error && <ErrorState error={mutation.error} reload={reload} />}
      {record.status === "OPEN" && (
        <button
          type="button"
          className="btn secondary full mb"
          disabled={mutation.pending}
          onClick={start}
        >
          Bắt đầu xem xét
        </button>
      )}
      {record.status === "OPEN" && (
        <p className="caption">
          Bắt đầu xem xét trước khi chọn kết quả và đóng vụ.
        </p>
      )}
      <fieldset disabled={record.status !== "IN_REVIEW" || mutation.pending}>
        <SelectField
          label="Kết quả xử lý *"
          values={
            report
              ? ["NO_ACTION", "CORRECTION_REQUIRED", "LISTING_HIDDEN", "OTHER"]
              : ["NO_ACTION", "RESOLVED", "UNRESOLVED", "OTHER"]
          }
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          placeholder="Chọn kết quả"
          required
        />
        <Field label="Tóm tắt cho người gửi *">
          <textarea name="summary" required minLength={10} maxLength={1000} />
        </Field>
        <Field label="Ghi chú nội bộ · Chỉ Admin">
          <textarea name="internalNote" maxLength={2000} />
        </Field>
        {report && (
          <SelectField
            key={outcome}
            label="Thao tác với tin"
            name="listingAction"
            placeholder="Không thay đổi"
            values={
              outcome === "NO_ACTION"
                ? []
                : outcome === "OTHER"
                  ? [
                      ["HIDE", "Ẩn tin"],
                      ["SHOW", "Hiện tin"],
                    ]
                  : [["HIDE", "Ẩn tin"]]
            }
          />
        )}
        <button className="btn full" disabled={mutation.pending}>
          Đóng vụ việc
        </button>
      </fieldset>
    </form>
  );
}
