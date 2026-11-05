"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ModerationTable } from "@/features/moderation/ModerationTable";

export function CodReturnsPage({ id, query = {} }) {
  const [page, setPage] = useState(
    Math.max(1, Number.parseInt(query.page, 10) || 1),
  );
  const [status, setStatus] = useState(
    ["OPEN", "ACCEPTED", "REJECTED"].includes(query.status) ? query.status : "",
  );
  const params = new URLSearchParams({
    page,
    limit: 20,
    ...(status ? { status } : {}),
  });
  const resource = useResource(`/admin/cod-return-requests?${params}`);
  const mutation = useMutation();
  const router = useRouter();
  const record = resource.data?.find((item) => item.requestId === id);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await mutation.run(
        `/admin/orders/${record.orderId}/cod-return-decisions`,
        {
          requestId: id,
          decision: form.get("decision"),
          reason: form.get("reason").trim(),
        },
      )
    )
      router.push("/admin/cod-returns");
  }
  return (
    <>
      <Heading
        eyebrow="XỬ LÝ HÀNG HOÀN COD"
        title={id ? "Hồ sơ hoàn COD" : "Yêu cầu hoàn về"}
        description="Người bán xác nhận hàng đã hoàn đủ về và chưa thu tiền; Admin xem xét hồ sơ để quyết định."
      />
      {id ? (
        <Breadcrumb href="/admin/cod-returns" back="Yêu cầu hoàn COD">
          <RecordId value={id} />
        </Breadcrumb>
      ) : (
        <SelectField
          label="Trạng thái yêu cầu"
          values={["OPEN", "ACCEPTED", "REJECTED"]}
          placeholder="Tất cả trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        />
      )}
      <Resource resource={resource}>
        {id ? (
          record ? (
            <div className="two-col">
              <div className="stack">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Thông tin yêu cầu</h2>
                    <Badge value={record.status} />
                  </div>
                  <dl className="kv">
                    <dt>Đơn hàng</dt>
                    <dd>
                      <RecordId value={record.orderId} />
                    </dd>
                    <dt>Người bán</dt>
                    <dd>
                      <RecordId value={record.sellerId} />
                    </dd>
                    <dt>Trạng thái đơn</dt>
                    <dd>
                      <Badge value={record.order?.status} />
                    </dd>
                    <dt>Thanh toán</dt>
                    <dd>
                      <Badge value={record.order?.paymentStatus} />
                    </dd>
                    <dt>Vận đơn</dt>
                    <dd>{record.trackingCode}</dd>
                    <dt>Đã gửi</dt>
                    <dd>{date(record.order?.shippedAt)}</dd>
                  </dl>
                  <h3 className="mt">Lý do người bán gửi</h3>
                  <p className="description">{record.reason}</p>
                </section>
                <section className="panel">
                  <h2>Các món trong đơn</h2>
                  {record.order?.items.map((item) => (
                    <div className="summary-row" key={item.listingId}>
                      <strong>{item.title}</strong>
                      <span>{money(item.price)}</span>
                    </div>
                  ))}
                </section>
                {record.decisionReason && (
                  <Notice tone="gray">
                    Quyết định: {record.decisionReason} ·{" "}
                    {date(record.decidedAt)}
                  </Notice>
                )}
                <Notice tone="amber">
                  Chấp nhận: đơn chuyển đã hoàn về, không cần thu và giải phóng
                  món khi đủ điều kiện. Từ chối: đơn tiếp tục cần rà soát. Không
                  tự hoàn tiền.
                </Notice>
              </div>
              <aside className="panel">
                <p className="eyebrow">QUYẾT ĐỊNH ADMIN</p>
                <h2>
                  {record.status === "OPEN"
                    ? "Kiểm tra trước khi chốt."
                    : "Đã lưu quyết định."}
                </h2>
                {record.status === "OPEN" ? (
                  <form onSubmit={submit}>
                    {mutation.error && (
                      <ErrorState
                        error={mutation.error}
                        reload={resource.reload}
                      />
                    )}
                    <SelectField
                      label="Quyết định *"
                      name="decision"
                      values={[
                        ["ACCEPT_RETURN", "Chấp nhận hoàn về"],
                        ["REJECT_RETURN", "Từ chối hoàn về"],
                      ]}
                      placeholder="Chọn quyết định"
                      required
                    />
                    <Field label="Lý do quyết định *">
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={2000}
                        required
                      />
                    </Field>
                    <button className="btn full" disabled={mutation.pending}>
                      Lưu quyết định
                    </button>
                  </form>
                ) : (
                  <Badge value={record.status} />
                )}
              </aside>
            </div>
          ) : (
            <Empty
              title="Hồ sơ không còn ở trang kết quả này."
              href="/admin/cod-returns"
              action="Về danh sách yêu cầu"
            />
          )
        ) : resource.data?.length ? (
          <>
            <ModerationTable
              headings={[
                "YÊU CẦU / ĐƠN",
                "VẬN ĐƠN",
                "GIÁ TRỊ",
                "TRẠNG THÁI",
                "",
              ]}
            >
              {resource.data.map((record) => (
                <tr key={record.requestId}>
                  <td>
                    <strong>
                      <RecordId value={record.requestId} />
                    </strong>
                    <p className="caption">
                      <RecordId value={record.orderId} />
                    </p>
                  </td>
                  <td>{record.trackingCode}</td>
                  <td>{money(record.order?.total)}</td>
                  <td>
                    <Badge value={record.status} />
                  </td>
                  <td>
                    <Link
                      className="link"
                      href={`/admin/cod-returns/${record.requestId}?${params}`}
                    >
                      Xem hồ sơ →
                    </Link>
                  </td>
                </tr>
              ))}
            </ModerationTable>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty title="Chưa có yêu cầu hoàn phù hợp." href={null} />
        )}
      </Resource>
    </>
  );
}
