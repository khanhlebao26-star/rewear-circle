import { Breadcrumb } from "@/components/ui/PageNavigation";
import { ErrorState, Notice } from "@/components/ui/Feedback";

export function AuthLayout({ breadcrumb, title, verification, error, message, children }) {
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <Breadcrumb>{breadcrumb}</Breadcrumb>
      <section className="auth">
        <div className="auth-visual">
          <p className="eyebrow">REWEAR YOUR STORY</p>
          <h2>
            Một món đồ cũ.
            <br />
            Một câu chuyện mới.
          </h2>
          <p>
            Giữ lại điều còn tốt.
            <br />
            Trao đi điều bạn từng yêu.
          </p>
          <img
            className="auth-art"
            src="/hero-wardrobe.svg"
            alt="Tủ đồ được mặc tiếp"
          />
        </div>
        <div className="auth-form">
          <p className="eyebrow">
            {verification ? "THÊM MỘT BƯỚC NHỎ" : "CHÀO BẠN ĐẾN VỚI REWEAR CIRCLE"}
          </p>
          <h1>{title}</h1>
          <p className="intro">
            {verification
              ? "Để tiếp tục mua bán bằng tài khoản của bạn."
              : "Một tài khoản để mua và bán những món đồ còn tốt."}
          </p>
          {error && <ErrorState error={error} />}
          {message && <Notice>{message}</Notice>}
          {children}
        </div>
      </section>
    </main>
  );
}
