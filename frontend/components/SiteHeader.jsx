"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SiteChrome.module.css";

const categories = ["Áo", "Quần", "Giày", "Phụ kiện"];

function Icon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

// Phase 1: pass real session/count data here when the account screens are connected.
export default function SiteHeader({ user = null, cartCount = 0, unreadCount = 0, onLogout }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const headerRef = useRef(null);
  const searchRef = useRef(null);
  const searchButtonRef = useRef(null);
  const isStaff = user && ["ADMIN", "SUPPORT"].includes(user.role);

  function closeMenus(except) {
    headerRef.current?.querySelectorAll("details[open]").forEach((item) => {
      if (item !== except) item.open = false;
    });
  }

  useEffect(() => {
    function handleOutside(event) {
      if (!headerRef.current?.contains(event.target)) closeMenus();
    }
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      const opened = headerRef.current?.querySelector("details[open]");
      opened?.querySelector("summary")?.focus();
      closeMenus();
      if (searchOpen) {
        setSearchOpen(false);
        searchButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function handleToggle(event) {
    if (event.currentTarget.open) closeMenus(event.currentTarget);
  }

  async function handleLogout() {
    if (!onLogout || loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
      closeMenus();
    } finally {
      setLoggingOut(false);
    }
  }

  const accountItems = !user
    ? [["/login", "Đăng nhập"], ["/register", "Tạo tài khoản"]]
    : isStaff
      ? [[user.role === "ADMIN" ? "/admin/cases" : "/support/cases", user.role === "ADMIN" ? "Khu quản trị" : "Vụ được giao"]]
      : [["/me", "Hồ sơ của tôi"], ["/me/orders", "Đơn mua"], ["/me/listings", "Tủ đồ của tôi"], ["/seller/orders", "Đơn bán"]];

  return (
    <header ref={headerRef} className={styles.header}>
      <a className={styles.skipLink} href="#main-content">Bỏ qua điều hướng</a>
      <div className={styles.announcement}>
        <div className={`site-shell ${styles.announcementInner}`}>
          <span>ĐỒ CŨ · CÂU CHUYỆN MỚI</span>
          <span className={styles.motto}>Mặc lại điều bạn yêu</span>
        </div>
      </div>
      <div className={`site-shell ${styles.headerInner}`}>
        <a className="brand" href="/" aria-label="Rewear Circle, trang chủ">
          <span className="brand-mark">R</span>
          <span>rewear<span className="brand-light">circle</span></span>
        </a>
        <nav className={styles.desktopNav} aria-label="Điều hướng chính">
          <a className={styles.navLink} href="/#discovery">Khám phá</a>
          <details className={styles.categoryMenu} onToggle={handleToggle}>
            <summary className={styles.navLink}>Danh mục</summary>
            <div className={`${styles.dropdown} ${styles.categoryPanel}`}>
              <p className={styles.menuCaption}>TÌM MÓN HỢP GU</p>
              {categories.map((category) => <a key={category} className={styles.menuItem} href={`/?category=${encodeURIComponent(category)}#discovery`}>{category}</a>)}
            </div>
          </details>
          <a className={styles.navLink} href="/help/buying">Cách mua</a>
          <a className={styles.navLink} href="/help/selling">Cách bán</a>
        </nav>
        <div className={styles.actions}>
          <button ref={searchButtonRef} className={styles.iconButton} type="button" aria-label={searchOpen ? "Đóng tìm kiếm" : "Mở tìm kiếm"} aria-expanded={searchOpen} aria-controls="site-search" onClick={() => { closeMenus(); setSearchOpen((open) => !open); }}><Icon name="search" /></button>
          {user && !isStaff && <a className={`${styles.iconButton} ${styles.notification}`} href="/me/notifications" aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"}><Icon name="bell" />{unreadCount > 0 && <span className={styles.dot} />}</a>}
          {!isStaff && <a className={styles.iconButton} href="/cart" aria-label={user && cartCount > 0 ? `Giỏ hàng, ${cartCount} món` : "Giỏ hàng"}><Icon name="bag" />{user && cartCount > 0 && <span className={styles.count}>{cartCount > 99 ? "99+" : cartCount}</span>}</a>}
          {!isStaff && <a className={`${styles.sellButton} ${styles.desktopSell}`} href="/sell">Đăng bán</a>}
          <details className={styles.accountMenu} onToggle={handleToggle}>
            <summary className={styles.avatar} aria-label="Mở menu tài khoản"><Icon name="user" /></summary>
            <div className={`${styles.dropdown} ${styles.accountPanel}`}>
              <div className={styles.accountHeading}><strong>{user ? `Chào ${user.displayName}` : "Chào bạn"}</strong><span>{user ? (isStaff ? "Tài khoản nhân viên" : "Một tài khoản để mua và bán") : "Đăng nhập để tiếp tục"}</span></div>
              {accountItems.map(([href, label]) => <a key={href} className={styles.menuItem} href={href}>{label}</a>)}
              {user && onLogout && <button className={`${styles.menuItem} ${styles.logout}`} type="button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>}
            </div>
          </details>
          <details className={styles.mobileMenu} onToggle={handleToggle}>
            <summary className={styles.iconButton} aria-label="Mở menu điều hướng"><Icon name="menu" /></summary>
            <nav className={styles.mobilePanel} aria-label="Điều hướng điện thoại">
              <a className={styles.menuItem} href="/#discovery">Khám phá</a>
              <div className={styles.mobileCategories}>{categories.map((category) => <a key={category} href={`/?category=${encodeURIComponent(category)}#discovery`}>{category}</a>)}</div>
              <a className={styles.menuItem} href="/help/buying">Cách mua</a>
              <a className={styles.menuItem} href="/help/selling">Cách bán</a>
              {accountItems.map(([href, label]) => <a key={href} className={styles.menuItem} href={href}>{label}</a>)}
              {user && onLogout && <button type="button" className={styles.menuItem} disabled={loggingOut} onClick={handleLogout}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>}
              {!isStaff && <a className={styles.sellButton} href="/sell">Đăng bán món đồ</a>}
            </nav>
          </details>
        </div>
      </div>
      {searchOpen && <div id="site-search" className={styles.searchPanel}><form action="/" method="get" className={`site-shell ${styles.searchForm}`}><Icon name="search" /><label className="sr-only" htmlFor="site-search-input">Tìm tên hoặc mô tả món</label><input ref={searchRef} id="site-search-input" name="q" placeholder="Bạn đang tìm món gì?" maxLength={100} /><button type="submit" className={styles.sellButton}>Tìm đồ</button></form></div>}
    </header>
  );
}
