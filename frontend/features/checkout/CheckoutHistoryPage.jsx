"use client";

import Link from "next/link";
import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Heading, RecordId, Pager } from "@/components/ui/PageNavigation";
import { SelectField } from "@/components/ui/FormFields";
import { date, money } from "@/lib/api.mjs";

export function CheckoutHistoryPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const resource = useResource(
    `/me/checkouts?page=${page}&limit=20${status ? `&status=${status}` : ""}`,
  );
  return (
    <>
      <Heading
        eyebrow="LỊCH SỬ ĐẶT HÀNG"
        title="Các lần đặt hàng"
        description="Mỗi lần đặt có thể gồm nhiều đơn, được tách theo người bán."
      />
      <SelectField
        label="Trạng thái"
        values={["CONFIRMED", "COMPLETED", "NEEDS_REVIEW", "CANCELLED"]}
        placeholder="Tất cả trạng thái"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
      />
      <Resource resource={resource}>
        {resource.data?.length ? (
          <>
            <div className="stack">
              {resource.data.map((checkout) => (
                <article className="order-card" key={checkout.checkoutId}>
                  <div className="order-head">
                    <strong>
                      <RecordId value={checkout.checkoutId} />
                    </strong>
                    <span>{date(checkout.createdAt)}</span>
                    <Badge value={checkout.status} />
                  </div>
                  <div className="order-body">
                    <div className="row between">
                      <h3>{checkout.orderIds.length} đơn · COD</h3>
                      <strong>{money(checkout.totalAmount)}</strong>
                    </div>
                    <div className="row">
                      <Link
                        href={`/checkouts/${checkout.checkoutId}`}
                        className="btn secondary sm"
                      >
                        Xem chi tiết
                      </Link>
                      <Link
                        href={`/checkouts/${checkout.checkoutId}/payment`}
                        className="link"
                      >
                        Tình trạng thu COD
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty title="Bạn chưa có lần đặt hàng phù hợp." />
        )}
      </Resource>
    </>
  );
}
