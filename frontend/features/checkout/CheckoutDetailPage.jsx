"use client";

import Link from "next/link";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, Resource } from "@/components/ui/Feedback";
import { date, money, shortId } from "@/lib/api.mjs";
import { OrderCard } from "@/features/orders/OrderCard";

export function CheckoutDetailPage({ id, mode }) {
  const payment = mode === "payment",
    success = mode === "success";
  const resource = useResource(`/checkouts/${id}${payment ? "/payment" : ""}`);
  const value = resource.data;
  return (
    <>
      <Breadcrumb href="/me/checkouts" back="Các lần đặt hàng">
        {shortId(id)}
      </Breadcrumb>
      {success ? (
        <div className="success-top">
          <div className="success-mark">
            <Icon name="check" size={30} />
          </div>
          <p className="eyebrow">CẢM ƠN BẠN ĐÃ CHỌN MẶC TIẾP</p>
          <h1>
            Món đồ cũ.
            <br />
            Niềm vui mới đang đến.
          </h1>
          <p>
            Lần đặt hàng đã được xác nhận. Thanh toán riêng theo từng người bán
            khi nhận hàng.
          </p>
        </div>
      ) : (
        <Heading
          eyebrow="LẦN ĐẶT HÀNG"
          title={payment ? "Tình trạng thu COD" : shortId(id)}
          description="Giao nhận và thanh toán được theo dõi riêng theo từng đơn."
        />
      )}
      <div className="tabs">
        <Link
          href={`/checkouts/${id}`}
          className={`tab ${!payment ? "active" : ""}`}
        >
          Các đơn hàng
        </Link>
        <Link
          href={`/checkouts/${id}/payment`}
          className={`tab ${payment ? "active" : ""}`}
        >
          Thanh toán COD
        </Link>
      </div>
      <Resource resource={resource}>
        {value && (
          <>
            <section className="panel mb">
              <div className="row between wrap">
                <h2>{money(payment ? value.amount : value.totalAmount)}</h2>
                <Badge value={value.status || value.checkoutStatus} />
              </div>
              {payment && (
                <>
                  <dl className="kv">
                    <dt>Cần thu</dt>
                    <dd>{money(value.collectibleAmount)}</dd>
                    <dt>Đã ghi nhận thu</dt>
                    <dd>{money(value.collectedAmount)}</dd>
                    <dt>Còn phải thu</dt>
                    <dd>{money(value.outstandingAmount)}</dd>
                  </dl>
                  <div className="mt">
                    <Notice tone="gray">
                      COD do người bán khai báo. Xác nhận nhận hàng và ghi nhận
                      thu tiền là hai thao tác riêng.
                    </Notice>
                  </div>
                </>
              )}
            </section>
            <div className="stack">
              {value.orders.map((order) =>
                payment ? (
                  <section key={order.orderId} className="panel">
                    <div className="row between wrap">
                      <Link href={`/orders/${order.orderId}`} className="link">
                        Đơn {shortId(order.orderId)}
                      </Link>
                      <Badge value={order.paymentStatus} />
                    </div>
                    <p className="mt">Tổng đơn: {money(order.amount)}</p>
                    {order.collection && (
                      <p className="caption">
                        Người bán khai báo · {date(order.collection.recordedAt)}
                      </p>
                    )}
                  </section>
                ) : (
                  <OrderCard key={order.orderId} order={order} />
                ),
              )}
            </div>
          </>
        )}
      </Resource>
    </>
  );
}
