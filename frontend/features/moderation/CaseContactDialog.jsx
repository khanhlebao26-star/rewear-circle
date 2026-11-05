"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@/hooks/useMutation";
import { ErrorState } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { date } from "@/lib/api.mjs";
import { ShippingAddress } from "@/components/ui/ShippingAddress";

export function CaseContactDialog({ id, support, onClose }) {
  const mutation = useMutation();
  const [contact, setContact] = useState(null);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, [onClose]);
  async function submit(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason").trim();
    const result = await mutation.run(
      `/${support ? "support" : "admin"}/cases/${id}/contact-access`,
      { reason },
    );
    if (result) setContact(result.data);
  }
  return (
    <Modal title="Thông tin liên hệ người nhận" onClose={onClose}>
      {contact ? (
        <>
          <ShippingAddress value={contact.shippingAddress} />
          <p className="caption">
            Đã ghi nhận lượt đọc {date(contact.accessedAt)}. Đóng cửa sổ để kết
            thúc lần xem.
          </p>
          <button className="btn secondary full" onClick={onClose}>
            Đóng thông tin liên hệ
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="small muted">
            Nêu lý do cho từng lần đọc. Chỉ xem thông tin nhận hàng của đơn liên
            quan vụ việc này.
          </p>
          {mutation.error && <ErrorState error={mutation.error} />}
          <Field label="Lý do truy cập *">
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              placeholder="Mục đích cần liên hệ để hỗ trợ vụ việc…"
            />
          </Field>
          <button className="btn full" disabled={mutation.pending}>
            Yêu cầu xem liên hệ
          </button>
        </form>
      )}
    </Modal>
  );
}
