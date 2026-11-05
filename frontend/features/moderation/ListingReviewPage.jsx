"use client";

import Link from "next/link";
import { useState } from "react";
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
import { date, money } from "@/lib/api.mjs";
import { ListingVersionContent } from "@/features/listings/ListingVersionContent";
import { AuditTrail } from "@/features/moderation/AuditTrail";
import { ListingVisibilityControl } from "@/features/moderation/ListingVisibilityControl";

export function ListingReviewPage({ id, management = false }) {
  const [page, setPage] = useState(1);
  const resource = useResource(
    `/admin/listing-versions${id ? `/${id}` : `?page=${page}&limit=20`}`,
  );
  const mutation = useMutation();
  const [decision, setDecision] = useState("APPROVE");
  const value = resource.data;
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await mutation.run(`/admin/listing-versions/${id}/decision`, {
        decision,
        reason: form.get("reason").trim(),
      })
    )
      resource.reload();
  }
  return (
    <>
      <Heading
        eyebrow={management ? "QUẢN LÝ TIN ĐĂNG" : "KIỂM DUYỆT TIN ĐĂNG"}
        title={id ? value?.version?.title || "Xem phiên bản" : "Hàng chờ duyệt"}
        description={management
          ? "Xem nội dung, lịch sử và trạng thái hiển thị của tin."
          : "Xem đầy đủ ảnh, mô tả và lỗi trước khi quyết định."}
      />
      <Resource resource={resource}>
        {id && value ? (
          <>
            <Breadcrumb
              href={management ? "/admin/listing-management" : "/admin/listings"}
              back={management ? "Quản lý tin đăng" : "Hàng chờ duyệt"}
            >
              Phiên bản <RecordId value={id} />
            </Breadcrumb>
            <div className="two-col">
              <div className="stack">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Nội dung người bán gửi</h2>
                    <Badge value={value.version.status} />
                  </div>
                  <p className="caption">
                    Người bán: {value.seller?.displayName} ·{" "}
                    <RecordId value={value.seller?.userId} />
                  </p>
                  <ListingVersionContent version={value.version} />
                  <div className="row wrap mt">
                    <Badge value={value.saleStatus} />
                    {value.sellerHidden && (
                      <Badge tone="gray">Người bán đã ẩn</Badge>
                    )}
                    {value.adminHidden && <Badge tone="red">Admin đã ẩn</Badge>}
                  </div>
                </section>
                <section className="panel">
                  <h2>Phiên bản & lịch sử xử lý</h2>
                  {value.versions.map((version) => (
                    <div className="audit" key={version._id}>
                      <strong>{version.title}</strong> ·{" "}
                      <Badge value={version.status} />
                      <p>
                        {date(version.submittedAt)} {version.rejectionReason}
                      </p>
                    </div>
                  ))}
                  <AuditTrail entries={value.auditHistory} />
                </section>
              </div>
              <aside className="stack">
                {management ? (
                  <section className="panel">
                    <h2>Hiển thị tin đăng</h2>
                    {value.adminHiddenReason && <p className="description">{value.adminHiddenReason}</p>}
                    <ListingVisibilityControl listing={value} reload={resource.reload} />
                    {value.version.status === "PENDING" && (
                      <p className="caption"><Link className="link" href={`/admin/listings/${id}`}>Mở trang duyệt phiên bản →</Link></p>
                    )}
                  </section>
                ) : (
                  <>
                    <form className="panel" onSubmit={submit}>
                      <p className="eyebrow">QUYẾT ĐỊNH KIỂM DUYỆT</p>
                      <h2>
                        {value.version.status === "PENDING"
                          ? "Xem kỹ trước khi duyệt."
                          : "Đã có quyết định."}
                      </h2>
                      {value.version.status === "PENDING" ? (
                        <>
                          {mutation.error && (
                            <ErrorState
                              error={mutation.error}
                              reload={resource.reload}
                            />
                          )}
                          <SelectField
                            label="Quyết định"
                            values={[
                              ["APPROVE", "Duyệt phiên bản"],
                              ["REJECT", "Từ chối phiên bản"],
                            ]}
                            value={decision}
                            onChange={(event) => setDecision(event.target.value)}
                          />
                          <Field
                            label={`Lý do${decision === "REJECT" ? " *" : ""}`}
                          >
                            <textarea
                              name="reason"
                              required={decision === "REJECT"}
                              maxLength={1000}
                            />
                          </Field>
                          <button className="btn full" disabled={mutation.pending}>
                            Lưu quyết định
                          </button>
                        </>
                      ) : (
                        <Badge value={value.version.status} />
                      )}
                    </form>
                    <Notice tone="gray">
                      Duyệt không tự gỡ cờ ẩn hoặc đổi trạng thái đã bán. Admin
                      không sửa nội dung thay người bán.
                    </Notice>
                  </>
                )}
              </aside>
            </div>
          </>
        ) : value?.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "TIN / PHIÊN BẢN",
                      "NGƯỜI BÁN",
                      "GIÁ",
                      "GỬI DUYỆT",
                      "",
                    ].map((text) => (
                      <th key={text}>{text}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.map((record) => (
                    <tr key={record.versionId}>
                      <td>
                        <strong>{record.version.title}</strong>
                        <p className="caption">
                          <RecordId value={record.listingId} /> /{" "}
                          <RecordId value={record.versionId} />
                        </p>
                      </td>
                      <td>{record.seller?.displayName}</td>
                      <td>{money(record.version.price)}</td>
                      <td>{date(record.submittedAt)}</td>
                      <td>
                        <Link
                          className="link"
                          href={`/admin/listings/${record.versionId}`}
                        >
                          Xem để duyệt →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty
            title="Không có phiên bản đang chờ duyệt."
            href={null}
            icon="check"
          />
        )}
      </Resource>
    </>
  );
}
