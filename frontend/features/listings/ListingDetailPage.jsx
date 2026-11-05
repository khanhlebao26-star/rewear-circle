"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import { useMutation } from "@/hooks/useMutation";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/PageNavigation";
import { ErrorState, Notice } from "@/components/ui/Feedback";
import { Gallery } from "@/components/ui/Gallery";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/api.mjs";

export default function ListingDetailPage({ id, listing, error }) {
  const router = useRouter();
  const session = useSession();
  const mutation = useMutation();
  async function add() {
    if (!session.user) {
      router.push(`/login?next=${encodeURIComponent(`/listings/${id}`)}`);
      return;
    }
    const result = await mutation.run("/cart/items", { listingId: id });
    if (result) {
      session.syncCartCount(result.data.listingIds.length);
      mutation.setMessage("Đã thêm món vào giỏ. Thêm vào giỏ chưa giữ món.");
    }
  }
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <Breadcrumb href="/listings" back="Danh sách sản phẩm">
        {listing?.title || "Chi tiết món đồ"}
      </Breadcrumb>
      {error ? (
        <ErrorState error={error} reload={() => router.refresh()} />
      ) : (
        listing && (
          <article className="detail">
            <div className="detail-gallery">
              <Gallery ids={listing.imageIds} title={listing.title} listingPhotos priority />
              {listing.watermark && (
                <span className="watermark">{listing.watermark}</span>
              )}
            </div>
            <div className="detail-copy">
              <p className="eyebrow">
                {listing.category} ·{" "}
                {listing.size === "FREE_SIZE"
                  ? "Freesize"
                  : `Size ${listing.size}`}
              </p>
              <h1>{listing.title}</h1>
              <p className="price">{money(listing.price)}</p>
              <Badge value={listing.saleStatus} />
              <div className="facts">
                <div>
                  <span>Tình trạng</span>
                  <strong>{listing.condition}</strong>
                </div>
                <div>
                  <span>Kích cỡ</span>
                  <strong>
                    {listing.size === "FREE_SIZE" ? "Freesize" : listing.size}
                  </strong>
                </div>
                <div>
                  <span>Gửi từ</span>
                  <strong>{listing.shipFrom}</strong>
                </div>
              </div>
              <section className="description">
                <h3>Một chút về món đồ</h3>
                <p>{listing.description}</p>
                <p>
                  <strong>Thông tin lỗi / lưu ý</strong>
                  <br />
                  {listing.flaws || "Người bán không ghi nhận lỗi bổ sung."}
                </p>
              </section>
              <hr className="rule" />
              {listing.canBuy && listing.sellerId !== session.user?.id ? (
                <button
                  className="btn full"
                  onClick={add}
                  disabled={session.loading || mutation.pending}
                >
                  <Icon name="bag" />
                  {mutation.pending ? "Đang thêm…" : "Thêm vào giỏ hàng"}
                </button>
              ) : (
                <Notice tone="gray">
                  {listing.sellerId === session.user?.id
                    ? "Đây là món đồ bạn đăng bán."
                    : listing.saleStatus === "SOLD"
                      ? "Món đồ đã có chủ mới."
                      : "Món đồ đang được giữ, hiện chưa thể thêm vào giỏ."}
                </Notice>
              )}
              {mutation.error && (
                <div className="mt">
                  <ErrorState error={mutation.error} />
                </div>
              )}
              {mutation.message && (
                <div className="mt">
                  <Notice>
                    {mutation.message}{" "}
                    <Link className="link" href="/cart">
                      Xem giỏ hàng
                    </Link>
                  </Notice>
                </div>
              )}
              <p className="small muted mt">
                <Icon name="truck" size={15} /> Phí vận chuyển đã nằm trong giá
                niêm yết.
              </p>
              <div className="row between mt">
                <Badge tone="gray">Thanh toán khi nhận hàng</Badge>
                <Link href={`/listings/${id}/report`} className="link">
                  <Icon name="flag" size={13} /> Báo cáo tin
                </Link>
              </div>
              <p className="flow-note">
                Mỗi món đồ là một lựa chọn để kéo dài vòng đời sản phẩm.
              </p>
            </div>
          </article>
        )
      )}
    </main>
  );
}
