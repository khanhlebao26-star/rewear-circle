"use client";

import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Heading, Pager } from "@/components/ui/PageNavigation";
import { label } from "@/lib/api.mjs";
import { OrderCard } from "@/features/orders/OrderCard";

export function OrdersPage({ selling = false }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const resource = useResource(
    `${selling ? "/me/sales" : "/me/orders"}?page=${page}&limit=20${status ? `&status=${status}` : ""}`,
  );
  return (
    <>
      <Heading
        eyebrow={selling ? "GÓC NGƯỜI BÁN" : "GÓC NGƯỜI MUA"}
        title={
          selling ? "Những món đồ bạn trao đi." : "Những món đồ bạn đón về."
        }
        description={
          selling
            ? "Gửi hàng, ghi nhận thu COD và theo dõi từng đơn bán."
            : "Theo dõi giao nhận và xem lại thông tin món đồ lúc đặt hàng."
        }
      />
      <div className="tabs">
        {[
          "",
          "CONFIRMED",
          "COMPLETED",
          "NEEDS_REVIEW",
          "CANCELLED",
          "RETURNED",
        ].map((value) => (
          <button
            key={value}
            className={`tab ${status === value ? "active" : ""}`}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {value ? label(value) : "Tất cả"}
          </button>
        ))}
      </div>
      <Resource resource={resource}>
        {resource.data?.length ? (
          <>
            <div className="stack">
              {resource.data.map((order) => (
                <OrderCard
                  key={order.orderId}
                  order={order}
                  selling={selling}
                />
              ))}
            </div>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty title="Chưa có đơn ở trạng thái này." icon="box">
            Các đơn phù hợp sẽ xuất hiện tại đây.
          </Empty>
        )}
      </Resource>
    </>
  );
}
