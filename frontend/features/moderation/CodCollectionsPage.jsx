"use client";

import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Empty, Notice, Resource } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Heading, RecordId, Pager } from "@/components/ui/PageNavigation";
import { date, money } from "@/lib/api.mjs";
import { ModerationTable } from "@/features/moderation/ModerationTable";

export function CodCollectionsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const resource = useResource(
    `/admin/cod-collections?${new URLSearchParams({ page, limit: 20, ...filters })}`,
  );
  function filter(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters(
      Object.fromEntries(
        ["orderId", "sellerId"]
          .filter((key) => form.get(key).trim())
          .map((key) => [key, form.get(key).trim()]),
      ),
    );
    setPage(1);
  }
  return (
    <>
      <Heading
        eyebrow="TRA CỨU COD"
        title="Ghi nhận thu tiền"
        description="Các khoản người bán khai báo đã thu đủ theo từng đơn."
      />
      <form className="table-filter" onSubmit={filter}>
        <Field
          label="Mã đơn hàng"
          name="orderId"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
        />
        <Field
          label="Mã người bán"
          name="sellerId"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
        />
        <button className="btn secondary sm">Tra cứu</button>
      </form>
      <Resource resource={resource}>
        {resource.data?.length ? (
          <>
            <ModerationTable
              headings={[
                "MÃ GHI NHẬN / ĐƠN",
                "NGƯỜI BÁN / MUA",
                "SỐ TIỀN",
                "NGUỒN",
                "THỜI ĐIỂM",
              ]}
            >
              {resource.data.map((record) => (
                <tr key={record.collectionId}>
                  <td>
                    <strong>
                      <RecordId value={record.collectionId} />
                    </strong>
                    <p className="caption">
                      <RecordId value={record.orderId} />
                    </p>
                  </td>
                  <td>
                    <RecordId value={record.sellerId} /> /{" "}
                    <RecordId value={record.buyerId} />
                  </td>
                  <td>{money(record.amount)}</td>
                  <td>Người bán khai báo</td>
                  <td>{date(record.recordedAt)}</td>
                </tr>
              ))}
            </ModerationTable>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty title="Chưa có ghi nhận phù hợp." href={null} />
        )}
      </Resource>
      <div className="mt">
        <Notice tone="gray">
          Lượt tra cứu được ghi nhận để truy vết. Admin không có thao tác tự
          đánh dấu đã thanh toán.
        </Notice>
      </div>
    </>
  );
}
