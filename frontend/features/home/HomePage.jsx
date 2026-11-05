"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CircularFashion from "@/features/home/CircularFashion";
import { Empty, ErrorState } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { ListingCard } from "@/features/listings/ListingCard";

export default function HomePage({ items = [], error }) {
  const router = useRouter();
  const sections = [
    {
      id: "latest-products",
      eyebrow: "01 / MÓN ĐỒ VỪA ĐẾN",
      title: "Sản phẩm mới nhất",
      items: items.slice(0, 4),
    },
    {
      id: "more-products",
      eyebrow: "02 / THÊM MỘT CHÚT CẢM HỨNG",
      title: "Khám phá thêm",
      items: items.slice(4, 8),
    },
  ];

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="shell page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">VÒNG ĐỜI MỚI CHO TỦ ĐỒ</p>
            <h1>
              Món đồ tốt
              <br />
              xứng đáng
              <br />
              <em>được mặc tiếp.</em>
            </h1>
            <p>
              Khám phá đồ đã qua sử dụng, tìm một món hợp gu.
              <br />
              Và viết tiếp câu chuyện của những điều bạn yêu.
            </p>
            <div className="row hero-cta">
              <Link href="/listings" className="btn">
                Khám phá tủ đồ <Icon name="arrow" size={16} />
              </Link>
              <Link href="/sell" className="btn quiet">
                Đăng bán món đồ
              </Link>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-art"
              src="/hero-wardrobe.svg"
              alt="Minh họa tủ đồ được mặc tiếp"
              fetchPriority="high"
            />
            <span className="hero-stamp">
              SECOND HAND
              <br />✳<br />
              NEW STORIES
            </span>
          </div>
        </section>
        <div className="hero-bottom">
          <span>
            <Icon name="leaf" size={14} /> Mỗi món đồ, một vòng đời mới
          </span>
          <span>
            <Icon name="bag" size={14} /> Thanh toán khi nhận hàng
          </span>
          <span>
            <Icon name="hanger" size={14} /> Một tài khoản để mua và bán
          </span>
        </div>

        {error ? (
          <div className="mt">
            <ErrorState error={error} reload={() => router.refresh()} />
          </div>
        ) : (
          sections.map((section) => (
            <section
              className="home-products"
              key={section.id}
              aria-labelledby={section.id}
            >
              <div className="title-row">
                <div>
                  <p className="eyebrow">{section.eyebrow}</p>
                  <h2 id={section.id}>{section.title}</h2>
                </div>
                <Link href="/listings" className="view-all">
                  Xem tất cả <Icon name="arrow" size={14} />
                </Link>
              </div>
              {section.items.length > 0 ? (
                <div className="grid">
                  {section.items.map((item) => (
                    <ListingCard listing={item} key={item.listingId} />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Những món đồ mới đang chờ được kể tiếp."
                  icon="hanger"
                >
                  Các món đồ đủ điều kiện bán sẽ xuất hiện tại đây.
                </Empty>
              )}
            </section>
          ))
        )}
      </div>
      <CircularFashion />
    </main>
  );
}
