import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { RecordId } from "@/components/ui/PageNavigation";
import { Gallery } from "@/components/ui/Gallery";
import { ItemRow } from "@/components/ui/ItemRow";
import { Notice } from "@/components/ui/Feedback";
import { date, money, reasons } from "@/lib/api.mjs";
import { ListingVisibilityControl } from "./ListingVisibilityControl";

export function CaseContent({ listing, order, entries, type, support, reload }) {
  const report = type === "REPORT";
  return (
    <>
      <section className="panel">
        <h2>{report ? "Tin bán liên quan" : "Đơn hàng liên quan"}</h2>
        {listing && (
          <>
            <h3>{listing.title}</h3>
            {listing.imageIds?.length > 0 && (
              <Gallery
                ids={listing.imageIds}
                title={listing.title}
              />
            )}
            <div className="row wrap mt">
              <Badge value={listing.saleStatus} />
              {listing.adminHidden && (
                <Badge tone="red">Admin đã ẩn</Badge>
              )}
              {listing.sellerHidden && (
                <Badge tone="gray">Người bán đã ẩn</Badge>
              )}
              {!support && (
                <ListingVisibilityControl
                  listing={listing}
                  reload={reload}
                />
              )}
              {!support && listing.approvedVersionId && (
                <Link
                  className="link"
                  href={`/admin/listings/${listing.approvedVersionId}`}
                >
                  Xem nội dung phiên bản
                </Link>
              )}
            </div>
          </>
        )}
        {order && (
          <>
            {order.items.map((item) => (
              <ItemRow key={item.orderItemId} item={item} snapshot />
            ))}
            <dl className="kv mt">
              <dt>Trạng thái đơn</dt>
              <dd>
                <Badge value={order.status} />
              </dd>
              <dt>Thanh toán</dt>
              <dd>
                {order.paymentMethod} ·{" "}
                <Badge value={order.paymentStatus} />
              </dd>
              <dt>Tổng đơn</dt>
              <dd>{money(order.total)}</dd>
              <dt>Vận đơn</dt>
              <dd>{order.trackingCode || "Chưa gửi"}</dd>
              <dt>Đã gửi / nhận</dt>
              <dd>
                {date(order.shippedAt)} /{" "}
                {date(order.receivedAt)}
              </dd>
              {order.sellerId && (
                <>
                  <dt>Người bán / mua</dt>
                  <dd>
                    <RecordId value={order.sellerId} /> /{" "}
                    <RecordId value={order.buyerId} />
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
      </section>
      <section className="panel">
        <h2>{report ? "Báo cáo gốc" : "Khiếu nại gốc"}</h2>
        {entries.map((entry) => (
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
              {reasons[type]?.[entry.reasonCode] ||
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
    </>
  );
}
