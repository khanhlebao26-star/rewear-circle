"use client";

import { useMutation } from "@/hooks/useMutation";
import { ErrorState, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";

export function OrderActionDialog({ order, operation, onClose, onSuccess }) {
  const mutation = useMutation();
  const shipment = operation === "shipment",
    collection = operation === "cod-collection",
    returning = operation === "cod-return-requests",
    cancel = operation === "cancel";
  const title = shipment
    ? "Ghi thông tin đã gửi hàng"
    : collection
      ? "Ghi nhận đã thu đủ COD"
      : returning
        ? "Hàng đã hoàn đủ về bạn?"
        : cancel
          ? "Hủy đơn COD này?"
          : "Bạn đã nhận đủ hàng?";
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = shipment
      ? {
          carrierName: values.carrierName.trim(),
          trackingCode: values.trackingCode.trim(),
        }
      : collection
        ? { amount: Number(values.amount), note: values.note.trim() }
        : returning
          ? { reason: values.reason.trim() }
          : {};
    if (collection && payload.amount !== order.total) {
      mutation.setError(new Error("Số tiền phải bằng đúng tổng đơn."));
      return;
    }
    if (
      await mutation.run(
        `/orders/${order.orderId}/${operation}`,
        payload,
        shipment ? "PUT" : "POST",
      )
    )
      onSuccess();
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {mutation.error && <ErrorState error={mutation.error} />}
        {shipment ? (
          <>
            <Field
              label="Đơn vị vận chuyển *"
              name="carrierName"
              required
              minLength={2}
              maxLength={100}
            />
            <Field
              label="Mã vận đơn *"
              name="trackingCode"
              required
              minLength={3}
              maxLength={100}
            />
          </>
        ) : collection ? (
          <>
            <Field
              label="Số tiền đã thu (VND)"
              name="amount"
              type="number"
              defaultValue={order.total}
              required
              min={1}
              step={1}
            />
            <Field label="Ghi chú">
              <textarea name="note" maxLength={1000} />
            </Field>
            <Notice tone="gray">
              Đây là khai báo từ người bán, không tự xác nhận người mua đã nhận
              hàng.
            </Notice>
          </>
        ) : returning ? (
          <>
            <Field label="Lý do yêu cầu *">
              <textarea
                name="reason"
                minLength={10}
                maxLength={2000}
                required
              />
            </Field>
            <Notice tone="amber">
              Chỉ gửi khi hàng đã hoàn đủ về và chưa thu COD. Đơn chuyển cần rà
              soát và chưa mở bán lại món.
            </Notice>
          </>
        ) : (
          <Notice tone={cancel ? "amber" : "gray"}>
            {cancel
              ? "Đơn chỉ hủy được trước khi gửi và trước khi thu tiền, khi không có vụ việc hoặc hạn chế đang chặn."
              : "Xác nhận đã nhận hàng sẽ hoàn tất đơn. Thao tác này không tự ghi nhận đã thu COD."}
          </Notice>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Quay lại
          </button>
          <button
            className={`btn ${cancel ? "danger" : ""}`}
            disabled={mutation.pending}
          >
            {mutation.pending ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
