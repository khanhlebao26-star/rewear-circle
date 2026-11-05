import Link from "next/link";
import { Brand } from "@/components/layout/Brand";
import { Icon } from "@/components/ui/Icon";

const categoryLinks = [
  ["Áo", "Áo các loại"],
  ["Quần", "Quần"],
  ["Giày", "Giày dép"],
  ["Phụ kiện", "Phụ kiện"],
];

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-shell">
        <div className="footer-main">
          <div className="footer-about">
            <Brand />
            <p>
              Một nơi để món đồ còn tốt tìm thấy người mặc tiếp theo. Kéo dài
              vòng đời trang phục, cùng xây dựng thói quen mặc đẹp có trách
              nhiệm.
            </p>
            <span className="footer-badge">
              <Icon name="check" size={14} />
              Tin đăng được duyệt trước khi hiển thị
            </span>
          </div>

          <nav className="footer-links" aria-label="Khám phá">
            <h3>Khám phá</h3>
            <Link href="/listings">Tất cả món đồ</Link>
            {categoryLinks.map(([category, title]) => (
              <Link
                key={category}
                href={`/listings?category=${encodeURIComponent(category)}`}
              >
                {title}
              </Link>
            ))}
            <Link href="/#latest-products">
              Sản phẩm mới nhất{" "}
              <span className="footer-dot" aria-hidden="true" />
            </Link>
          </nav>

          <nav className="footer-links" aria-label="Mua và bán">
            <h3>Mua &amp; bán</h3>
            <Link href="/me/orders">Đơn mua</Link>
            <Link href="/me/listings">Tủ đồ của tôi</Link>
            <Link href="/seller/orders">Đơn bán của tôi</Link>
            <Link className="footer-sell" href="/sell">
              Đăng bán món đồ
            </Link>
          </nav>

          <section className="footer-community">
            <h2>Tham gia vòng tròn thời trang tuần hoàn</h2>
            <p>Nhận bản tin về những món đồ mới và cách chăm sóc quần áo.</p>
            <div className="footer-subscribe">
              <input
                type="email"
                placeholder="Nhập email của bạn..."
                aria-label="Email nhận bản tin"
                disabled
              />
              <button type="button" disabled>
                Đăng ký
              </button>
            </div>
            <small>Đăng ký nhận bản tin chưa mở.</small>

            <div className="footer-social">
              <p>Kết nối cùng chúng tôi</p>
              <ul aria-label="Các kênh mạng xã hội chưa có liên kết">
                <li aria-label="Instagram" title="Instagram">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle
                      cx="17.5"
                      cy="6.5"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </li>
                <li aria-label="Facebook" title="Facebook">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="currentColor"
                  >
                    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.8 3.6-3.8 1 0 2.1.2 2.1.2v2.4h-1.2c-1.2 0-1.5.7-1.5 1.5V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12Z" />
                  </svg>
                </li>
                <li aria-label="TikTok" title="TikTok">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="currentColor"
                  >
                    <path d="M14 3h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.4V16a6 6 0 1 1-6-6h1v3h-1a3 3 0 1 0 3 3V3Z" />
                  </svg>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <div className="footer-bottom">
          <div className="footer-copyright">
            <span>© {new Date().getFullYear()} Rewear Circle.</span>
            <span aria-hidden="true">·</span>
            <em>Mặc lại điều bạn yêu.</em>
          </div>
          <span className="footer-payment">
            Thanh toán COD <span aria-hidden="true">/</span> Tiếng Việt · VND
          </span>
        </div>
      </div>
    </footer>
  );
}
