"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/layout/AppShell";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { ItemRow } from "@/components/ui/ItemRow";
import { Notice, Resource } from "@/components/ui/Feedback";
import { date, money, shortId } from "@/lib/api.mjs";
import { OrderActionDialog } from "@/features/orders/OrderActionDialog";
import { ShippingAddress } from "@/components/ui/ShippingAddress";

export function OrderDetailPage({ id, selling }) {
  const resource = useResource(`/orders/${id}`);
  const [operation, setOperation] = useState(null);
  const session = useSession();
  const order = resource.data;
  const buyer = order?.buyerId === session.user.id;
  const seller = order?.sellerId === session.user.id;
  const actions = order
    ? [
        order.canShip && ["shipment", "Ghi thông tin đã gửi hàng"],
        order.canConfirmReceipt && ["receipt-confirmation", "Tôi đã nhận hàng"],
        seller &&
          order.shippedAt &&
          order.paymentStatus === "UNPAID" &&
          !order.paymentReviewHold &&
          (order.canFulfill || order.status === "COMPLETED") && [
            "cod-collection",
            "Ghi nhận đã thu đủ COD",
          ],
        seller &&
          order.canFulfill &&
          order.shippedAt &&
          !order.receivedAt &&
          order.paymentStatus === "UNPAID" && [
            "cod-return-requests",
            "Yêu cầu xác nhận hàng hoàn về",
          ],
        buyer &&
          order.canFulfill &&
          !order.shippedAt &&
          order.paymentStatus === "UNPAID" && ["cancel", "Hủy đơn COD"],
      ].filter(Boolean)
    : [];
  return (
    <>
      <Breadcrumb
        href={selling ? "/seller/orders" : "/me/orders"}
        back={selling ? "Đơn bán" : "Đơn mua"}
      >
        {shortId(id)}
      </Breadcrumb>
      <Heading
        eyebrow={selling ? "CHI TIẾT ĐƠN BÁN" : "CHI TIẾT ĐƠN MUA"}
        title={shortId(id)}
        description={order ? `Đặt ngày ${date(order.createdAt)}` : ""}
      />
      <Resource resource={resource}>
        {order && (
          <>
            <div className="row wrap mb">
              <Badge value={order.status} />
              <Badge value={order.paymentStatus} />
              {order.shippedAt && <Badge tone="blue">Đã gửi hàng</Badge>}
            </div>
            {(!order.canFulfill && order.status === "CONFIRMED") ||
            order.status === "NEEDS_REVIEW" ? (
              <div className="mb">
                <Notice tone="amber">
                  Một số thao tác đang tạm chặn do vụ việc, hạn chế hoặc trạng
                  thái của đơn. Các bên tiếp tục khi đủ điều kiện xử lý.
                </Notice>
              </div>
            ) : null}
            <div className="two-col">
              <div className="stack">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Món đồ trong đơn</h2>
                    <span className="small muted">Bản lưu lúc đặt</span>
                  </div>
                  {order.items.map((item) => (
                    <ItemRow key={item.orderItemId} item={item} snapshot />
                  ))}
                  <div className="summary-row">
                    <span>Vận chuyển</span>
                    <span>Đã nằm trong giá</span>
                  </div>
                  <div className="summary-row summary-total">
                    <span>Tổng đơn</span>
                    <strong>{money(order.total)}</strong>
                  </div>
                </section>
                <section className="panel">
                  <h2>Giao nhận</h2>
                  {order.shippingAddress ? (
                    <ShippingAddress value={order.shippingAddress} />
                  ) : (
                    <Notice tone="gray">
                      Thông tin người nhận chỉ hiển thị khi đơn đủ điều kiện
                      giao nhận.
                    </Notice>
                  )}
                  <hr className="rule" />
                  {order.shippedAt ? (
                    <dl className="kv">
                      <dt>Đơn vị vận chuyển</dt>
                      <dd>{order.carrierName}</dd>
                      <dt>Mã vận đơn</dt>
                      <dd>{order.trackingCode}</dd>
                      <dt>Đã gửi</dt>
                      <dd>{date(order.shippedAt)}</dd>
                    </dl>
                  ) : (
                    <p className="small muted">
                      Người bán chưa ghi thông tin đã gửi hàng.
                    </p>
                  )}
                  <p className="caption">
                    Người bán tự đặt vận chuyển và cập nhật vận đơn.
                  </p>
                </section>
                {order.codReturnRequest && (
                  <section className="panel">
                    <h2>Yêu cầu hoàn COD</h2>
                    <Badge value={order.codReturnRequest.status} />
                    <p className="description mt">
                      {order.codReturnRequest.reason}
                    </p>
                    {order.codReturnRequest.decisionReason && (
                      <p className="description">
                        Quyết định: {order.codReturnRequest.decisionReason}
                      </p>
                    )}
                  </section>
                )}
              </div>
              <aside className="stack">
                <section className="panel">
                  <h2>Các mốc đơn hàng</h2>
                  <ol className="timeline mt">
                    <li>
                      <div>
                        <strong>Đơn đã tạo</strong>
                        <small>{date(order.createdAt)}</small>
                      </div>
                    </li>
                    <li className={order.shippedAt ? "" : "pending"}>
                      <div>
                        <strong>
                          {order.shippedAt
                            ? "Người bán đã gửi"
                            : "Chờ gửi hàng"}
                        </strong>
                        <small>{date(order.shippedAt)}</small>
                      </div>
                    </li>
                    <li className={order.receivedAt ? "" : "pending"}>
                      <div>
                        <strong>
                          {order.receivedAt
                            ? "Người mua đã nhận"
                            : "Chờ xác nhận nhận hàng"}
                        </strong>
                        <small>{date(order.receivedAt)}</small>
                      </div>
                    </li>
                  </ol>
                  <div className="stack mt">
                    {actions.map(([value, text]) => (
                      <button
                        key={value}
                        className="btn secondary full"
                        onClick={() => setOperation(value)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <p className="eyebrow">THANH TOÁN COD</p>
                  <Badge value={order.paymentStatus} />
                  <p className="small muted mt">
                    {order.codCollection
                      ? `Người bán khai báo · ${date(order.codCollection.recordedAt)}`
                      : "Xác nhận nhận hàng không tự ghi nhận đã thu tiền."}
                  </p>
                  {buyer && (
                    <Link
                      className="link"
                      href={`/checkouts/${order.checkoutId}/payment`}
                    >
                      Xem tình trạng thu COD
                    </Link>
                  )}
                </section>
                {buyer && (
                  <section className="panel">
                    <h3>Cần xem xét đơn này?</h3>
                    {(order.canComplainDelivery || order.canComplainItem) && (
                      <Link
                        href={`/orders/${id}/complaints/new`}
                        className="btn secondary full"
                      >
                        Gửi khiếu nại
                      </Link>
                    )}
                    <Link className="link" href={`/orders/${id}/complaints`}>
                      Xem bản khiếu nại đã gửi
                    </Link>
                  </section>
                )}
              </aside>
            </div>
            {operation && (
              <OrderActionDialog
                order={order}
                operation={operation}
                onClose={() => setOperation(null)}
                onSuccess={() => {
                  setOperation(null);
                  resource.reload();
                  session.refreshNotifications();
                }}
              />
            )}
          </>
        )}
      </Resource>
    </>
  );
}
