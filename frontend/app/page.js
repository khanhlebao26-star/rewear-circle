"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const categories = ["Áo", "Quần", "Giày", "Phụ kiện"];
const sizesByCategory = {
  Áo: ["XS", "S", "M", "L", "XL", "XXL"],
  Quần: ["XS", "S", "M", "L", "XL", "XXL"],
  Giày: Array.from({ length: 11 }, (_, index) => String(index + 35)),
  "Phụ kiện": ["FREE_SIZE"],
};
const conditions = ["Mới", "Còn mới", "Còn tốt", "Đã sử dụng", "Đã sử dụng, còn tốt"];

const emptyFilters = {
  q: "",
  category: "",
  size: "",
  condition: "",
  minPrice: "",
  maxPrice: "",
};

function ListingPhoto({ imageId, title, className }) {
  const [unavailable, setUnavailable] = useState(!imageId);
  if (unavailable) {
    return <span className={`${className} image-placeholder`} role="img" aria-label={`${title}, ảnh đang cập nhật`}>RC</span>;
  }

  return (
    <img
      className={className}
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

function ListingCard({ listing }) {
  return (
    <article className="listing-card">
      <Link className="listing-image-link" href={`/listings/${listing.listingId}`}>
        <ListingPhoto imageId={listing.imageIds?.[0]} title={listing.title} className="listing-image" />
      </Link>
      <div className="listing-card-copy">
        <p className="eyebrow">{listing.category} <span>·</span> Cỡ {listing.size}</p>
        <h2><Link href={`/listings/${listing.listingId}`}>{listing.title}</Link></h2>
        <p className="condition">{listing.condition}</p>
        <p className="listing-price">{money(listing.price)}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const loadListings = useCallback(async (nextFilters = emptyFilters, nextPage = 1) => {
    setLoading(true);
    setError("");
    setLoginRequired(false);

    const query = new URLSearchParams({ page: String(nextPage), limit: "20" });
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value.trim()) query.set(key, value.trim());
    }

    try {
      const response = await fetch(`/api/v1/listings?${query}`, { credentials: "same-origin" });
      const result = await response.json();
      if (response.status === 401 && Object.values(nextFilters).some((value) => value.trim())) {
        setLoginRequired(true);
        setItems([]);
        setError("Đăng nhập để tìm kiếm hoặc dùng bộ lọc.");
        return;
      }
      if (!response.ok) {
        throw new Error(result.error?.message || "Không thể tải danh sách tin.");
      }

      setItems(result.data || []);
      setMeta(result.meta || { total: 0, limit: 20 });
      setPage(nextPage);
    } catch (requestError) {
      setError(requestError.message || "Không thể kết nối đến Rewear Circle.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
      ...(name === "category" ? { size: "" } : {}),
    }));
  }

  function submitFilters(event) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setLoginError("");
    loadListings(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setLoginError("");
    loadListings(emptyFilters);
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Đăng nhập không thành công.");
      setLoginRequired(false);
      await loadListings(appliedFilters);
    } catch (requestError) {
      setLoginError(requestError.message || "Đăng nhập không thành công.");
    } finally {
      setLoggingIn(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(meta.total / (meta.limit || 20)));

  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Rewear Circle, trang chủ">
          <span className="brand-mark">R</span>
          <span>rewear<span className="brand-light">circle</span></span>
        </Link>
        <span className="topbar-note">Mặc lại điều bạn yêu</span>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">VÒNG ĐỜI MỚI CHO TỦ ĐỒ</p>
          <h1 id="page-title">Món đồ tốt<br />xứng đáng <em>được mặc tiếp.</em></h1>
          <p className="hero-description">
            Khám phá những món đồ đã qua sử dụng, được tuyển chọn để tìm thấy người mặc tiếp theo.
          </p>
        </div>
        <div className="hero-stamp" aria-hidden="true">
          <span>SECOND</span><span>HAND</span><b>·</b><span>NEW</span><span>STORIES</span>
        </div>
      </section>

      <section className="discovery" aria-labelledby="discovery-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CHỌN MÓN TIẾP THEO</p>
            <h2 id="discovery-title">Đồ đang tìm chủ mới</h2>
          </div>
          <p className="result-count" aria-live="polite">
            {loading ? "Đang tải…" : `${meta.total} món đồ`}
          </p>
        </div>

        <form className="filter-panel" onSubmit={submitFilters}>
          <label className="search-field">
            <span className="sr-only">Tìm tên hoặc mô tả</span>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              name="q"
              value={filters.q}
              onChange={updateFilter}
              placeholder="Bạn đang tìm món gì?"
              maxLength={100}
            />
          </label>
          <label>
            <span className="sr-only">Danh mục</span>
            <select name="category" value={filters.category} onChange={updateFilter}>
              <option value="">Danh mục</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Kích cỡ</span>
            <select name="size" value={filters.size} onChange={updateFilter}>
              <option value="">Kích cỡ</option>
              {(filters.category ? sizesByCategory[filters.category] : [...new Set(Object.values(sizesByCategory).flat())])
                .map((size) => <option key={size}>{size}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Tình trạng</span>
            <select name="condition" value={filters.condition} onChange={updateFilter}>
              <option value="">Tình trạng</option>
              {conditions.map((condition) => <option key={condition}>{condition}</option>)}
            </select>
          </label>
          <label className="price-field">
            <span className="sr-only">Giá từ</span>
            <input name="minPrice" type="number" min="20000" max="5000000" step="10000" value={filters.minPrice} onChange={updateFilter} placeholder="Từ ₫" />
          </label>
          <label className="price-field">
            <span className="sr-only">Giá đến</span>
            <input name="maxPrice" type="number" min="20000" max="5000000" step="10000" value={filters.maxPrice} onChange={updateFilter} placeholder="Đến ₫" />
          </label>
          <button className="button button-primary" type="submit">Tìm đồ</button>
          <button className="button button-quiet" type="button" onClick={clearFilters}>Xóa lọc</button>
        </form>

        {loginRequired && (
          <form className="login-panel" onSubmit={submitLogin}>
            <div>
              <p className="eyebrow">CẦN TÀI KHOẢN</p>
              <h3>Đăng nhập để dùng tìm kiếm và bộ lọc</h3>
              <p>Feed vẫn mở công khai. Tìm kiếm và lọc cần phiên đăng nhập theo chính sách API.</p>
            </div>
            <label>Email<input type="email" autoComplete="username" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label>
            <label>Mật khẩu<input type="password" autoComplete="current-password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
            <button className="button button-primary" type="submit" disabled={loggingIn}>{loggingIn ? "Đang đăng nhập…" : "Đăng nhập"}</button>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
          </form>
        )}

        {error && !loginRequired && <p className="notice notice-error" role="alert">{error}</p>}

        {loading ? (
          <div className="listing-grid" aria-label="Đang tải tin đăng" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => <div className="listing-skeleton" key={index} />)}
          </div>
        ) : error ? (
          loginRequired ? null : <div className="empty-state"><span className="empty-symbol">↻</span><h3>Chưa tải được danh sách</h3><p>Kiểm tra kết nối rồi thử lại.</p><button className="button button-secondary" onClick={() => loadListings(appliedFilters, page)}>Thử lại</button></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><span className="empty-symbol">✳</span><h3>Chưa tìm thấy món phù hợp</h3><p>Thử đổi từ khóa hoặc nới rộng bộ lọc một chút nhé.</p><button className="button button-secondary" onClick={clearFilters}>Xem tất cả món đồ</button></div>
        ) : (
          <>
            <div className="listing-grid">
              {items.map((listing) => <ListingCard key={listing.listingId} listing={listing} />)}
            </div>
            {pageCount > 1 && (
              <nav className="pagination" aria-label="Phân trang tin đăng">
                <button className="button button-secondary" disabled={page <= 1 || loading} onClick={() => loadListings(appliedFilters, page - 1)}>Trước</button>
                <span>Trang {page} / {pageCount}</span>
                <button className="button button-secondary" disabled={page >= pageCount || loading} onClick={() => loadListings(appliedFilters, page + 1)}>Tiếp</button>
              </nav>
            )}
          </>
        )}
      </section>

      <footer className="footer"><span>Rewear Circle</span><span>Trao đổi có ý thức · Mặc lại với yêu thương</span></footer>
    </main>
  );
}
