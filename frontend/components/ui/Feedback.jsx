"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function Notice({ children, tone = "", icon = "info" }) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "red" ? "alert" : "status"}
    >
      <Icon name={icon} size={17} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({
  title = "Chưa có dữ liệu.",
  children,
  href = "/listings",
  action = "Khám phá món đồ",
  icon = "bag",
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {href && (
        <Link href={href} className="btn secondary">
          {action}
        </Link>
      )}
    </div>
  );
}

export function Loading({ cards = false }) {
  return cards ? (
    <div className="grid" aria-busy="true" aria-label="Đang tải món đồ">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i}>
          <div className="skeleton skeleton-art" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  ) : (
    <div className="loading-panel" role="status" aria-busy="true">
      Đang tải…
    </div>
  );
}

export function Resource({
  resource,
  children,
  empty = "Chưa có dữ liệu phù hợp.",
}) {
  return resource.loading ? (
    <Loading />
  ) : resource.error ? (
    <ErrorState error={resource.error} reload={resource.reload} />
  ) : resource.data == null ? (
    <Empty title={empty} />
  ) : (
    children
  );
}

export function ErrorState({ error, reload }) {
  return (
    <div className="stack">
      <Notice tone="red">{error.message}</Notice>
      {error.status === 401 ? (
        <Link
          className="btn secondary"
          href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/me" : window.location.pathname + window.location.search)}`}
        >
          Đăng nhập để tiếp tục
        </Link>
      ) : error.status === 403 && error.code === "EMAIL_NOT_VERIFIED" ? (
        <Link href="/verify-email" className="btn">
          Xác minh email
        </Link>
      ) : (
        reload && (
          <button className="btn secondary" onClick={reload}>
            Thử lại
          </button>
        )
      )}
    </div>
  );
}
