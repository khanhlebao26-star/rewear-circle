"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { categories } from "@/lib/api.mjs";
import { Icon } from "@/components/ui/Icon";
import { Brand } from "@/components/layout/Brand";

const greenImpactHref = "/#thoi-trang-tuan-hoan";

export default function SiteHeader({
  user,
  cartCount = 0,
  unreadCount = 0,
  onLogout,
}) {
  const pathname = usePathname();
  const header = useRef(null);
  const isStaff = user && user.role !== "USER";
  const links = !user
    ? [
        ["/login", "Đăng nhập"],
        ["/register", "Tạo tài khoản"],
      ]
    : isStaff
      ? [
          [
            user.role === "ADMIN" ? "/admin/cases" : "/support/cases",
            user.role === "ADMIN" ? "Khu quản trị" : "Vụ được giao",
          ],
        ]
      : [
          ["/me", "Hồ sơ của tôi"],
          ["/me/orders", "Đơn mua"],
          ["/me/listings", "Tủ đồ của tôi"],
          ["/seller/orders", "Đơn bán"],
        ];
  function close(except) {
    header.current?.querySelectorAll("details[open]").forEach((menu) => {
      if (menu !== except) menu.open = false;
    });
  }
  useEffect(() => {
    close();
  }, [pathname]);
  useEffect(() => {
    const outside = (event) => {
      if (!header.current?.contains(event.target)) close();
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        header.current?.querySelector("details[open] summary")?.focus();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const toggle = (event) => {
    if (event.currentTarget.open) close(event.currentTarget);
  };
  return (
    <header
      ref={header}
      onClick={(event) => {
        if (event.target.closest("a")) close();
      }}
    >
      <a className="skip" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <div className="topline">
        <div className="shell row between">
          <span>ĐỒ CŨ · CÂU CHUYỆN MỚI</span>
          <span className="motto">Mặc lại điều bạn yêu</span>
        </div>
      </div>
      <div className="header">
        <div className="shell nav">
          <Brand />
          <nav className="navlinks" aria-label="Điều hướng chính">
            <Link href="/" className={pathname === "/" ? "active" : ""}>
              Khám phá
            </Link>
            {Object.keys(categories).map((category) => (
              <Link
                key={category}
                href={`/listings?category=${encodeURIComponent(category)}`}
              >
                {category}
              </Link>
            ))}
            <Link href={greenImpactHref} className="impact-nav">
              <Icon name="earth" size={16} /> Tác động xanh
            </Link>
          </nav>
          <div className="nav-actions">
            <Link
              href="/listings#listing-search"
              className="icon-btn"
              aria-label="Tìm kiếm"
            >
              <Icon name="search" />
            </Link>
            {user && (
              <Link
                href="/me/notifications"
                className="icon-btn"
                aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`}
              >
                <Icon name="bell" />
                {unreadCount > 0 && (
                  <span className="count">{unreadCount}</span>
                )}
              </Link>
            )}
            {!isStaff && (
              <>
                <Link
                  className="icon-btn"
                  href="/cart"
                  aria-label={`Giỏ hàng${cartCount ? `, ${cartCount} món` : ""}`}
                >
                  <Icon name="bag" />
                  {cartCount > 0 && <span className="count">{cartCount}</span>}
                </Link>
                <Link className="btn sm sell-nav" href="/sell">
                  <Icon name="plus" size={14} /> Đăng bán
                </Link>
              </>
            )}
            <details className="header-menu" onToggle={toggle}>
              <summary className="avatar" aria-label="Mở menu tài khoản">
                {user ? (
                  user.displayName
                    .split(" ")
                    .map((s) => s[0])
                    .slice(-2)
                    .join("")
                ) : (
                  <Icon name="user" size={17} />
                )}
              </summary>
              <div className="header-dropdown">
                <strong>
                  {user ? `Chào ${user.displayName}` : "Chào bạn"}
                </strong>
                <p className="small muted">
                  {user
                    ? "Mặc lại điều bạn yêu."
                    : "Đăng nhập để mua và bán món đồ của bạn."}
                </p>
                {links.map(([href, text]) => (
                  <Link className="side-link" key={href} href={href}>
                    {text}
                  </Link>
                ))}
                {user && (
                  <button className="side-link" onClick={onLogout}>
                    Đăng xuất
                  </button>
                )}
              </div>
            </details>
            <details className="header-menu mobile-menu" onToggle={toggle}>
              <summary className="icon-btn" aria-label="Mở điều hướng">
                <Icon name="menu" />
              </summary>
              <div className="header-dropdown">
                <Link className="side-link" href="/">
                  Khám phá
                </Link>
                {Object.keys(categories).map((category) => (
                  <Link
                    key={category}
                    className="side-link"
                    href={`/listings?category=${encodeURIComponent(category)}`}
                  >
                    {category}
                  </Link>
                ))}
                <Link className="side-link impact-nav" href={greenImpactHref}>
                  <Icon name="earth" size={16} /> Tác động xanh
                </Link>
                {links.map(([href, text]) => (
                  <Link className="side-link" key={href} href={href}>
                    {text}
                  </Link>
                ))}
                {!isStaff && (
                  <Link className="btn full" href="/sell">
                    Đăng bán món đồ
                  </Link>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
