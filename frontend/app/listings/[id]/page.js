"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function ListingPhoto({ imageId, title }) {
  const [unavailable, setUnavailable] = useState(!imageId);
  if (unavailable) {
    return <span className="detail-image image-placeholder" role="img" aria-label={`${title}, ảnh đang cập nhật`}>RC</span>;
  }

  return (
    <img
      className="detail-image"
      src={`/api/v1/media/${imageId}`}
      alt={title}
      onError={() => setUnavailable(true)}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 16 || event.currentTarget.naturalHeight < 16) {
          setUnavailable(true);
        }
      }}
    />
  );
}

function money(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetch(`/api/v1/listings/${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Không tìm thấy tin đăng.");
        return result.data;
      })
      .then((result) => { if (active) setListing(result); })
      .catch((requestError) => { if (active) setError(requestError.message || "Không thể tải chi tiết tin."); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [id]);

  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Rewear Circle, trang chủ">
          <span className="brand-mark">R</span>
          <span>rewear<span className="brand-light">circle</span></span>
        </Link>
        <Link className="back-link" href="/">← Trở lại khám phá</Link>
      </header>

      {loading ? (
        <section className="detail-loading" aria-busy="true"><div className="detail-image-skeleton" /><div className="detail-copy-skeleton" /></section>
      ) : error ? (
        <section className="empty-state detail-empty" role="status">
          <span className="empty-symbol">—</span>
          <h1>Không xem được tin này</h1>
          <p>{error}</p>
          <Link className="button button-secondary" href="/">Quay lại danh sách</Link>
        </section>
      ) : listing ? (
        <article className="detail-layout">
          <div className="detail-image-wrap">
            <ListingPhoto imageId={listing.imageIds?.[0]} title={listing.title} />
            {listing.watermark && <span className="sold-watermark">{listing.watermark}</span>}
          </div>
          <div className="detail-copy">
            <p className="eyebrow">{listing.category} <span>·</span> Cỡ {listing.size} <span>·</span> {listing.condition}</p>
            <h1>{listing.title}</h1>
            <p className="detail-price">{money(listing.price)}</p>
            <div className={`availability ${listing.canBuy ? "is-available" : "is-unavailable"}`}>
              <span className="availability-dot" />
              {listing.canBuy ? "Đang có sẵn" : listing.saleStatus === "SOLD" ? "Món đồ đã có chủ mới" : "Món đồ đang được giữ"}
            </div>
            <div className="detail-divider" />
            <section className="detail-section">
              <h2>Mô tả</h2>
              <p>{listing.description}</p>
              {listing.flaws && <p><strong>Lưu ý:</strong> {listing.flaws}</p>}
            </section>
            <section className="detail-section detail-facts">
              <div><span>Tình trạng</span><strong>{listing.condition}</strong></div>
              <div><span>Kích cỡ</span><strong>{listing.size}</strong></div>
              <div><span>Gửi từ</span><strong>{listing.shipFrom}</strong></div>
            </section>
            <p className="detail-note">Mỗi món đồ là một lựa chọn để kéo dài vòng đời sản phẩm.</p>
          </div>
        </article>
      ) : null}

      <footer className="footer"><span>Rewear Circle</span><span>Trao đổi có ý thức · Mặc lại với yêu thương</span></footer>
    </main>
  );
}
