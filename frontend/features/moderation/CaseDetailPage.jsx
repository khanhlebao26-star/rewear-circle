"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb, Heading, RecordId } from "@/components/ui/PageNavigation";
import { Gallery } from "@/components/ui/Gallery";
import { ItemRow } from "@/components/ui/ItemRow";
import { Notice, Resource } from "@/components/ui/Feedback";
import { date, money, reasons } from "@/lib/api.mjs";
import { AuditTrail } from "@/features/moderation/AuditTrail";
import { CaseContactDialog } from "@/features/moderation/CaseContactDialog";
import { CaseAssignmentForm } from "@/features/moderation/CaseAssignmentForm";
import { CaseDecisionForm } from "@/features/moderation/CaseDecisionForm";
import { ListingVisibilityControl } from "@/features/moderation/ListingVisibilityControl";

export function CaseDetailPage({ id, support }) {
  const resource = useResource(`/${support ? "support" : "admin"}/cases/${id}`);
  const [contact, setContact] = useState(false);
  const value = resource.data;
  const record = value?.case;
  const report = record?.type === "REPORT";
  const closed = record?.status === "CLOSED";
  useEffect(() => {
    const refresh = () => {
      setContact(false);
      resource.reload();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [id]);
  return (
    <>
      <Breadcrumb
        href={`/${support ? "support" : "admin"}/cases`}
        back={support ? "Vụ được giao" : "Danh sách vụ việc"}
      >
        Chi tiết vụ
      </Breadcrumb>
      <Heading
        eyebrow={report ? "BÁO CÁO TIN BÁN" : "KHIẾU NẠI ĐƠN HÀNG"}
        title={<RecordId value={id} />}
        action={
          <button
            className="btn secondary sm"
            onClick={() => {
              setContact(false);
              resource.reload();
            }}
          >
            Cập nhật
          </button>
        }
      />
      <Resource resource={resource}>
        {record && (
          <>
            <div className="case-strip">
              <Badge value={record.status} />
              <span>
                Mục tiêu <RecordId value={record.targetId} />
              </span>
              <span>
                Phân công:{" "}
                {record.assignedSupportId ? (
                  <RecordId value={record.assignedSupportId} />
                ) : (
                  "Chưa giao"
                )}
              </span>
            </div>
            <div className="two-col">
              <div className="stack">
                <section className="panel">
                  <h2>{report ? "Tin bán liên quan" : "Đơn hàng liên quan"}</h2>
                  {value.listing && (
                    <>
                      <h3>{value.listing.title}</h3>
                      {value.listing.imageIds?.length > 0 && (
                        <Gallery
                          ids={value.listing.imageIds}
                          title={value.listing.title}
                        />
                      )}
                      <div className="row wrap mt">
                        <Badge value={value.listing.saleStatus} />
                        {value.listing.adminHidden && (
                          <Badge tone="red">Admin đã ẩn</Badge>
                        )}
                        {value.listing.sellerHidden && (
                          <Badge tone="gray">Người bán đã ẩn</Badge>
                        )}
                        {!support && (
                          <ListingVisibilityControl
                            listing={value.listing}
                            reload={resource.reload}
                          />
                        )}
                        {!support && value.listing.approvedVersionId && (
                          <Link
                            className="link"
                            href={`/admin/listings/${value.listing.approvedVersionId}`}
                          >
                            Xem nội dung phiên bản
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                  {value.order && (
                    <>
                      {value.order.items.map((item) => (
                        <ItemRow key={item.orderItemId} item={item} snapshot />
                      ))}
                      <dl className="kv mt">
                        <dt>Trạng thái đơn</dt>
                        <dd>
                          <Badge value={value.order.status} />
                        </dd>
                        <dt>Thanh toán</dt>
                        <dd>
                          {value.order.paymentMethod} ·{" "}
                          <Badge value={value.order.paymentStatus} />
                        </dd>
                        <dt>Tổng đơn</dt>
                        <dd>{money(value.order.total)}</dd>
                        <dt>Vận đơn</dt>
                        <dd>{value.order.trackingCode || "Chưa gửi"}</dd>
                        <dt>Đã gửi / nhận</dt>
                        <dd>
                          {date(value.order.shippedAt)} /{" "}
                          {date(value.order.receivedAt)}
                        </dd>
                        {value.order.sellerId && (
                          <>
                            <dt>Người bán / mua</dt>
                            <dd>
                              <RecordId value={value.order.sellerId} /> /{" "}
                              <RecordId value={value.order.buyerId} />
                            </dd>
                          </>
                        )}
                      </dl>
                    </>
                  )}
                </section>
                <section className="panel">
                  <h2>{report ? "Báo cáo gốc" : "Khiếu nại gốc"}</h2>
                  {(value.reports || value.complaints || []).map((entry) => (
                    <article
                      className="report-entry"
                      key={entry.reportId || entry.complaintId}
                    >
                      <div className="row between wrap">
                        <strong>
                          {entry.reporter?.displayName || (
                            <RecordId
                              value={entry.reportId || entry.complaintId}
                            />
                          )}
                        </strong>
                        <span className="caption">{date(entry.createdAt)}</span>
                      </div>
                      <h3 className="mt">
                        {reasons[record.type]?.[entry.reasonCode] ||
                          entry.reasonCode}
                      </h3>
                      {entry.contentRedacted ? (
                        <Notice tone="gray">
                          Nội dung gốc đã được lược bỏ theo thời hạn lưu trữ.
                        </Notice>
                      ) : (
                        <>
                          <p className="description">{entry.details}</p>
                          {entry.itemSnapshots?.map((item) => (
                            <ItemRow
                              key={item.orderItemId}
                              item={item}
                              snapshot
                            />
                          ))}
                          <div className="evidence">
                            {entry.evidenceMediaIds?.map((image) => (
                              <Gallery
                                key={image}
                                ids={[image]}
                                title="Ảnh bằng chứng"
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </section>
                {!report && !closed && (
                  <section className="panel">
                    <h2>Thông tin liên hệ người nhận</h2>
                    <p className="small muted">
                      Cần nêu lý do cho từng lần đọc thông tin liên hệ của đơn.
                    </p>
                    <button
                      className="btn secondary"
                      onClick={() => setContact(true)}
                    >
                      Yêu cầu xem liên hệ
                    </button>
                  </section>
                )}
                <section className="panel">
                  <h2>{support ? "Các mốc xử lý" : "Lịch sử truy vết"}</h2>
                  <AuditTrail
                    entries={support ? value.timeline : value.auditHistory}
                  />
                  {!support &&
                    record.decisions?.map((decision, i) => (
                      <div className="audit" key={i}>
                        <Badge value={decision.toStatus} />
                        <p>{decision.outcomeSummary}</p>
                        {decision.internalNote && (
                          <p>Ghi chú nội bộ: {decision.internalNote}</p>
                        )}
                      </div>
                    ))}
                </section>
              </div>
              <aside className="stack">
                {!support && !closed && (
                  <>
                    <CaseAssignmentForm
                      record={record}
                      reload={resource.reload}
                    />
                    <CaseDecisionForm
                      record={record}
                      reload={resource.reload}
                    />
                  </>
                )}
                {closed ? (
                  <section className="panel">
                    <p className="eyebrow">KẾT QUẢ ĐÃ LƯU</p>
                    <h2>Vụ việc đã đóng.</h2>
                    <Badge value={record.outcomeCode} />
                    <p className="description mt">{record.outcomeSummary}</p>
                    <p className="caption">Vụ đã đóng không được mở lại.</p>
                  </section>
                ) : (
                  support && (
                    <Notice tone="gray">
                      Bạn được đọc nội dung và bằng chứng của vụ được giao.
                      Quyết định xử lý thuộc Admin.
                    </Notice>
                  )
                )}
                <Notice tone="amber">
                  {report
                    ? "Ẩn / hiện tin là thao tác kiểm duyệt. Không sửa nội dung thay người bán."
                    : "Đóng vụ không tự thay đổi thanh toán, hoàn tiền hoặc trạng thái đơn."}
                </Notice>
              </aside>
            </div>
            {contact && !closed && (
              <CaseContactDialog
                id={id}
                support={support}
                onClose={() => setContact(false)}
              />
            )}
          </>
        )}
      </Resource>
    </>
  );
}
