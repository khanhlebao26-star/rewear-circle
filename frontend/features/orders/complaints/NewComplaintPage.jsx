"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { ErrorState, Notice, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { ItemRow } from "@/components/ui/ItemRow";
import { EvidenceUpload } from "@/components/ui/EvidenceUpload";
import { complaintPayload, label, reasons, shortId } from "@/lib/api.mjs";
import { ComplaintHeading } from "./ComplaintHeading";

export function NewComplaintPage({ id }) {
  const resource = useResource(`/orders/${id}`);
  const mutation = useMutation();
  const router = useRouter();
  const session = useSession();
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const order = resource.data;
  const type = order?.canComplainItem ? "ITEM" : "DELIVERY";
  async function submit(event) {
    event.preventDefault();
    if (uploading) return;
    const form = new FormData(event.currentTarget);
    const selected = form.getAll("affectedOrderItemIds");
    if (type === "ITEM" && !selected.length) {
      mutation.setError(new Error("Chọn ít nhất một món thuộc đơn này."));
      return;
    }
    const result = await mutation.run(
      `/orders/${id}/complaints`,
      complaintPayload(
        type,
        form.get("reasonCode"),
        form.get("details"),
        images,
        selected,
      ),
    );
    if (result) {
      session.refreshNotifications();
      router.push(`/orders/${id}/complaints/${result.data.complaintId}`);
    }
  }
  const availableReasons = Object.entries(reasons[type]).filter(
    ([key]) =>
      type !== "DELIVERY" ||
      !order ||
      key === "OTHER" ||
      (order.shippedAt
        ? key !== "SELLER_NOT_SHIPPED"
        : key === "SELLER_NOT_SHIPPED"),
  );

  return (
    <>
      <ComplaintHeading
        id={id}
        title="Bạn cần xem xét đơn này?"
        breadcrumb="Gửi khiếu nại"
      />
      <Resource resource={resource}>
        {order && (
          !(order.canComplainItem || order.canComplainDelivery) ? (
            <Notice tone="amber">
              Đơn chưa đủ điều kiện gửi thêm khiếu nại. Kiểm tra trạng thái,
              giới hạn bản gửi và thời gian chờ sau đóng vụ.
            </Notice>
          ) : (
            <div className="two-col">
              <form className="panel" onSubmit={submit}>
                <p className="eyebrow">{label(type)}</p>
                {mutation.error && <ErrorState error={mutation.error} />}
                {type === "ITEM" && (
                  <div className="mb">
                    <h3>Chọn món có vấn đề *</h3>
                    {order.items.map((item) => (
                      <label className="check-label" key={item.orderItemId}>
                        <input
                          type="checkbox"
                          name="affectedOrderItemIds"
                          value={item.orderItemId}
                        />
                        <span>{item.title}</span>
                      </label>
                    ))}
                  </div>
                )}
                <SelectField
                  label="Lý do *"
                  name="reasonCode"
                  values={availableReasons}
                  placeholder="Chọn lý do"
                  required
                />
                <Field label="Mô tả vấn đề *">
                  <textarea
                    name="details"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </Field>
                <EvidenceUpload
                  purpose="CASE_EVIDENCE"
                  ids={images}
                  onChange={setImages}
                  onBusy={setUploading}
                />
                <button
                  className="btn full mt"
                  disabled={mutation.pending || uploading}
                >
                  Gửi khiếu nại
                </button>
              </form>
              <aside className="stack">
                <section className="panel">
                  <h2>Đơn {shortId(id)}</h2>
                  {order.items.map((item) => (
                    <ItemRow key={item.orderItemId} item={item} snapshot />
                  ))}
                </section>
                <Notice tone="amber">
                  Khiếu nại giao nhận áp dụng cho toàn đơn. Khiếu nại món chỉ
                  gửi sau khi xác nhận nhận. Vụ đang mở tạm chặn giao nhận và
                  COD, không tự hoàn tiền.
                </Notice>
                <Notice tone="gray">
                  Tối đa 3 bản / vụ đang mở, 5 bản mới / 24 giờ. Đợi 24 giờ sau
                  đóng vụ để gửi lại cùng loại.
                </Notice>
              </aside>
            </div>
          )
        )}
      </Resource>
    </>
  );
}
