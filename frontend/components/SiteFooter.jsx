import styles from "./SiteChrome.module.css";

const groups = [
  { title: "Khám phá", links: [["/#discovery", "Tất cả món đồ"], ...["Áo", "Quần", "Giày", "Phụ kiện"].map((category) => [`/?category=${encodeURIComponent(category)}#discovery`, category])] },
  { title: "Mua & bán", links: [["/help/buying", "Hướng dẫn mua"], ["/help/selling", "Hướng dẫn đăng bán"], ["/me/orders", "Theo dõi đơn mua"], ["/me/listings", "Quản lý tủ đồ"]] },
  { title: "Thông tin & hỗ trợ", links: [["/about", "Về Rewear Circle"], ["/help/faq", "Câu hỏi thường gặp"], ["/help/safety", "Hướng dẫn mua bán an toàn"], ["/help/complaints", "Báo cáo & khiếu nại"]] },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`site-shell ${styles.footerTop}`}>
        <div className={styles.footerAbout}>
          <a className="brand" href="/" aria-label="Rewear Circle, trang chủ"><span className="brand-mark">R</span><span>rewear<span className="brand-light">circle</span></span></a>
          <h2>Mặc lại điều bạn yêu.</h2>
          <p>Một nơi để món đồ còn tốt tìm thấy người mặc tiếp theo. Mua bán rõ ràng, trao đi có trách nhiệm.</p>
          <span className={styles.codLabel}>Thanh toán khi nhận hàng · COD</span>
        </div>
        {groups.map(({ title, links }) => <nav key={title} aria-label={title}><h3>{title}</h3>{links.map(([href, label]) => <a className={styles.footerLink} key={href} href={href}>{label}</a>)}</nav>)}
      </div>
      <div className={`site-shell ${styles.footerBottom}`}>
        <span>© {new Date().getFullYear()} Rewear Circle</span>
        <div><a href="/terms">Điều khoản sử dụng</a><a href="/privacy">Quyền riêng tư</a><span>Tiếng Việt · VND</span></div>
      </div>
    </footer>
  );
}
