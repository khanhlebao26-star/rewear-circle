"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { Badge } from "@/components/ui/Badge";
import {
  Breadcrumb,
  Heading,
  RecordId,
  Pager,
} from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Notice, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Gallery } from "@/components/ui/Gallery";
import { ItemRow } from "@/components/ui/ItemRow";
import { complaintPayload, date, label, reasons, shortId } from "@/lib/api.mjs";
import { EvidenceUpload } from "@/components/ui/EvidenceUpload";

export function ComplaintsPage({ id, sub }) {
  const creating = sub === "new",
    detail = sub && !creating;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const resource = useResource(
    creating
      ? `/orders/${id}`
      : `/orders/${id}/complaints${detail ? `/${sub}` : `?page=${page}&limit=20${status ? `&status=${status}` : ""}${typeFilter ? `&type=${typeFilter}` : ""}`}`,
  );
  const mutation = useMutation();
  const router = useRouter();
  const session = useSession();
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const order = creating ? resource.data : null;
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
      <Breadcrumb href={`/orders/${id}`} back={`Đơn ${shortId(id)}`}>
        {creating ? "Gửi khiếu nại" : "Bản khiếu nại đã gửi"}
      </Breadcrumb>
      <Heading
        eyebrow="THEO DÕI YÊU CẦU"
        title={
          creating
            ? "Bạn cần xem xét đơn này?"
            : detail
              ? "Bản khiếu nại của bạn"
              : "Khiếu nại của bạn"
        }
        description="Chỉ hiển thị bản bạn gửi và kết quả tóm tắt công khai."
      />
      <Resource resource={resource}>
        {creating && order ? (
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
        ) : detail && resource.data ? (
          <div className="two-col">
            <section className="panel">
              <div className="panel-title">
                <h2>{label(resource.data.type)}</h2>
                <Badge value={resource.data.caseStatus} />
              </div>
              <h3>{reasons[resource.data.type]?.[resource.data.reasonCode]}</h3>
              <p className="description">{resource.data.details}</p>
              <p className="caption">Đã gửi {date(resource.data.receivedAt)}</p>
              <div className="evidence">
                {resource.data.evidenceMediaIds.map((image) => (
                  <Gallery
                    key={image}
                    ids={[image]}
                    title="Bằng chứng của bạn"
                  />
                ))}
              </div>
              {resource.data.caseStatus === "CLOSED" && (
                <div className="mt">
                  <Notice>
                    <strong>{label(resource.data.outcomeCode)}</strong>
                    <p>{resource.data.outcomeSummary}</p>
                  </Notice>
                </div>
              )}
            </section>
            <aside className="panel">
              <h2>Tiến trình</h2>
              <ol className="timeline mt">
                <li>
                  <div>
                    <strong>Đã tiếp nhận</strong>
                    <small>{date(resource.data.receivedAt)}</small>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{label(resource.data.caseStatus)}</strong>
                    <small>
                      {resource.data.closedAt
                        ? date(resource.data.closedAt)
                        : "Chờ cập nhật kết quả"}
                    </small>
                  </div>
                </li>
              </ol>
            </aside>
          </div>
        ) : (
          <>
            <div className="table-filter">
              <select
                aria-label="Trạng thái khiếu nại"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {["OPEN", "IN_REVIEW", "CLOSED"].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Loại khiếu nại"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả loại</option>
                {["DELIVERY", "ITEM"].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </div>
            {resource.data?.length ? (
              <>
                <div className="stack">
                  {resource.data.map((record) => (
                    <section className="panel" key={record.complaintId}>
                      <div className="row between wrap">
                        <h3>
                          <RecordId value={record.complaintId} /> ·{" "}
                          {label(record.type)}
                        </h3>
                        <Badge value={record.caseStatus} />
                      </div>
                      <p className="caption">{date(record.receivedAt)}</p>
                      <Link
                        className="link"
                        href={`/orders/${id}/complaints/${record.complaintId}`}
                      >
                        Xem bản đã gửi →
                      </Link>
                    </section>
                  ))}
                </div>
                <Pager meta={resource.meta} page={page} onPage={setPage} />
              </>
            ) : (
              <Empty
                title="Chưa có bản khiếu nại phù hợp."
                href={`/orders/${id}`}
                action="Về chi tiết đơn"
                icon="flag"
              />
            )}
          </>
        )}
      </Resource>
    </>
  );
}
