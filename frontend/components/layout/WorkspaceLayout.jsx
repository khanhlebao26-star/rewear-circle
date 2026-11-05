"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import { Brand } from "@/components/layout/Brand";
import { Icon } from "@/components/ui/Icon";

const userLinks = [
  ["/me", "user", "Hồ sơ của tôi"],
  ["/me/orders", "box", "Đơn mua"],
  ["/me/checkouts", "file", "Các lần đặt hàng"],
  ["/me/listings", "hanger", "Tủ đồ của tôi"],
  ["/seller/orders", "truck", "Đơn bán"],
  ["/me/notifications", "bell", "Thông báo"],
];

const adminLinks = [
  ["/admin/listings", "file", "Duyệt tin đăng"],
  ["/admin/listing-management", "hanger", "Quản lý tin đăng"],
  ["/admin/cases", "flag", "Vụ việc"],
  ["/admin/cod-collections", "bag", "Ghi nhận thu COD"],
  ["/admin/cod-returns", "box", "Yêu cầu hoàn COD"],
];

export function WorkspaceLayout({ children, staff = false, support = false }) {
  const session = useSession();
  const pathname = usePathname();
  const links = staff
    ? support
      ? [["/support/cases", "flag", "Vụ được giao"]]
      : adminLinks
    : userLinks;
  const nav = links.map(([href, icon, title]) => (
    <Link
      key={href}
      href={href}
      className={`side-link ${pathname === href || (href !== "/me" && pathname.startsWith(href + "/")) ? "active" : ""}`}
    >
      <Icon name={icon} size={17} />
      {title}
    </Link>
  ));
  if (staff)
    return (
      <div className="staff-layout">
        <a className="skip" href="#main-content">
          Bỏ qua điều hướng
        </a>
        <aside className="staff-side">
          <Brand />
          <p className="side-label">
            {support ? "HỖ TRỢ THEO VỤ VIỆC" : "KHÔNG GIAN QUẢN TRỊ"}
          </p>
          {nav}
          <div className="side-bottom">
            <Link className="side-link" href="/me/notifications">
              <Icon name="bell" />
              Thông báo
            </Link>
            {session.user && (
              <button className="side-link" onClick={session.logout}>
                <Icon name="logout" />
                Đăng xuất
              </button>
            )}
          </div>
        </aside>
        <div className="staff-main">
          <header className="staff-top">
            <span>
              {support ? "Hỗ trợ khách hàng" : "Kiểm duyệt & vận hành"}
            </span>
            <span>{session.user?.displayName}</span>
          </header>
          <main id="main-content" className="staff-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    );
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <div className="account-layout">
        <aside className="account-side">
          <div className="account-user">
            <div className="avatar">
              <Icon name="user" />
            </div>
            <div>
              <strong>{session.user?.displayName}</strong>
              <span>
                {session.user?.emailVerifiedAt
                  ? "Email đã xác minh"
                  : "Chưa xác minh email"}
              </span>
            </div>
          </div>
          {nav}
          {session.user && (
            <button className="side-link" onClick={session.logout}>
              <Icon name="logout" />
              Đăng xuất
            </button>
          )}
        </aside>
        <div className="account-content">{children}</div>
      </div>
    </main>
  );
}
