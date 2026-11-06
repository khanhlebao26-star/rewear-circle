"use client";

import { useState } from "react";
import { useMutation } from "@/hooks/useMutation";
import { ErrorState } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";

export function ListingVisibilityControl({ listing, reload, disabled }) {
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      action: listing.adminHidden ? "SHOW" : "HIDE",
      reason: form.get("reason").trim(),
    };
    if (!listing.adminHidden)
      payload.requireCorrection = form.has("requireCorrection");
    if (
      await mutation.run(
        `/admin/listings/${listing.listingId}/visibility`,
        payload,
      )
    ) {
      setOpen(false);
      reload();
    }
  }
  return (
    <>
      <button className="btn secondary sm" onClick={() => setOpen(true)} disabled={disabled}>
        {listing.adminHidden ? "Hiện tin (Admin)" : "Ẩn tin (Admin)"}
      </button>
      {open && (
        <Modal
          title={listing.adminHidden ? "Hiện tin bán" : "Ẩn tin bán"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            {mutation.error && (
              <ErrorState error={mutation.error} reload={reload} />
            )}
            <Field label="Lý do kiểm duyệt *">
              <textarea name="reason" required maxLength={1000} />
            </Field>
            {!listing.adminHidden && (
              <label className="check-label">
                <input type="checkbox" name="requireCorrection" />
                Yêu cầu người bán gửi bản sửa
              </label>
            )}
            <button className="btn full" disabled={mutation.pending}>
              Lưu trạng thái tin
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
