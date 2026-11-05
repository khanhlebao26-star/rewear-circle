"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { categories, conditions } from "@/lib/api.mjs";
import useResource from "@/hooks/useResource";
import { Breadcrumb, Pager } from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Loading } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { ListingCard } from "@/features/listings/ListingCard";

const keys = ["q", "category", "size", "condition", "minPrice", "maxPrice"];
export default function CatalogPage({ query }) {
  const router = useRouter();
  const values = Object.fromEntries(
    keys.map((key) => [key, typeof query[key] === "string" ? query[key] : ""]),
  );
  const queryKey = JSON.stringify(values);
  const [filters, setFilters] = useState(values);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    setFilters(JSON.parse(queryKey));
    setFormError("");
  }, [queryKey]);
  const page = Math.max(1, Number(query.page) || 1);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  for (const [key, value] of Object.entries(values))
    if (value.trim()) params.set(key, value.trim());
  const resource = useResource(`/listings?${params}`);
  function submit(event) {
    event.preventDefault();
    if (
      filters.minPrice &&
      filters.maxPrice &&
      +filters.minPrice > +filters.maxPrice
    ) {
      setFormError("Giá từ phải nhỏ hơn hoặc bằng giá đến.");
      return;
    }
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value.trim()) next.set(key, value.trim());
    router.push(`/listings${next.size ? `?${next}` : ""}#listing-search`);
  }
  const update = (event) => {
    const { name, value } = event.target;
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "category" ? { size: "" } : {}),
    }));
  };
  const movePage = (number) => {
    const next = new URLSearchParams(params);
    next.set("page", number);
    next.delete("limit");
    router.push(`/listings?${next}#listing-search`);
  };
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <Breadcrumb>{values.category || "Tất cả món đồ"}</Breadcrumb>
      <section className="discovery">
        <div className="title-row">
          <div>
            <p className="eyebrow">01 / KHÁM PHÁ TỦ ĐỒ</p>
            <h1>{values.category || "Tất cả món đồ"}</h1>
          </div>
          <span className="small muted" aria-live="polite">
            {resource.loading
              ? "Đang tải…"
              : `${resource.meta.total || 0} món đồ`}
          </span>
        </div>
        <div className="categories">
          <Link
            href="/listings"
            className={`chip ${!values.category ? "active" : ""}`}
          >
            Tất cả món đồ
          </Link>
          {Object.keys(categories).map((category) => (
            <Link
              key={category}
              href={`/listings?category=${encodeURIComponent(category)}`}
              className={`chip ${values.category === category ? "active" : ""}`}
            >
              {category}
            </Link>
          ))}
        </div>
        <form id="listing-search" className="filters" onSubmit={submit}>
          <label className="search">
            <span className="sr-only">Tìm tên hoặc mô tả</span>
            <Icon name="search" size={16} />
            <input
              name="q"
              value={filters.q}
              onChange={update}
              maxLength={100}
              placeholder="Bạn đang tìm món gì?"
            />
          </label>
          <label>
            <span className="sr-only">Kích cỡ</span>
            <select name="size" value={filters.size} onChange={update}>
              <option value="">Kích cỡ</option>
              {(
                categories[filters.category] || [
                  ...new Set(Object.values(categories).flat()),
                ]
              ).map((size) => (
                <option key={size} value={size}>
                  {size === "FREE_SIZE" ? "Freesize" : size}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Tình trạng</span>
            <select
              name="condition"
              value={filters.condition}
              onChange={update}
            >
              <option value="">Tình trạng</option>
              {conditions.map((condition) => (
                <option key={condition}>{condition}</option>
              ))}
            </select>
          </label>
          {["minPrice", "maxPrice"].map((key, index) => (
            <label key={key}>
              <span className="sr-only">{index ? "Giá đến" : "Giá từ"}</span>
              <input
                type="number"
                name={key}
                value={filters[key]}
                onChange={update}
                min="20000"
                max="5000000"
                step="1"
                placeholder={index ? "Giá đến ₫" : "Giá từ ₫"}
              />
            </label>
          ))}
          <button className="btn" type="submit">
            Tìm đồ <Icon name="arrow" size={14} />
          </button>
        </form>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="filter-bottom">
          <span>Mới nhất trước · 20 món / trang</span>
          <Link className="link" href="/listings">
            Xóa bộ lọc
          </Link>
        </div>
        {resource.loading ? (
          <Loading cards />
        ) : resource.error ? (
          <ErrorState error={resource.error} reload={resource.reload} />
        ) : resource.data?.length ? (
          <>
            <div className="grid">
              {resource.data.map((item, index) => (
                <ListingCard key={item.listingId} listing={item} eager={index < 4} />
              ))}
            </div>
            <Pager meta={resource.meta} page={page} onPage={movePage} />
          </>
        ) : (
          <Empty
            title="Chưa tìm thấy món phù hợp."
            href="/listings"
            action="Xóa lọc & xem tất cả"
            icon="search"
          >
            Thử thay đổi từ khóa, danh mục hoặc khoảng giá.
          </Empty>
        )}
      </section>
    </main>
  );
}
