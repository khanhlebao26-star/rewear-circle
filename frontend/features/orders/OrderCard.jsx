"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { RecordId } from "@/components/ui/PageNavigation";
import { ItemRow } from "@/components/ui/ItemRow";
import { date, money } from "@/lib/api.mjs";

export function OrderCard({ order, selling }) {
  return (
    <article className="order-card">
      <div className="order-head">
        <div className="row wrap">
          <strong>
            <RecordId value={order.orderId} />
          </strong>
          <span className="muted">{date(order.createdAt)} · COD</span>
        </div>
        <Badge value={order.status} />
      </div>
      <div className="order-body">
        {order.items.map((item) => (
          <ItemRow key={item.orderItemId} item={item} />
        ))}
        <div className="row between wrap mt">
          <div>
            <p className="small muted m0">
              {order.shippedAt
                ? "Người bán đã gửi hàng"
                : "Chờ người bán gửi hàng"}
            </p>
            <Badge value={order.paymentStatus} />
          </div>
          <div className="right">
            <p className="small">
              Tổng đơn: <strong>{money(order.total)}</strong>
            </p>
            <Link
              href={`${selling ? "/seller/orders" : "/orders"}/${order.orderId}`}
              className="btn secondary sm"
            >
              Xem chi tiết <Icon name="arrow" size={13} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
