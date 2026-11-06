"use client";

import Link from "next/link";
import { shortId } from "@/lib/api.mjs";

export function Heading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div className="row between wrap">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {description && <p className="m0">{description}</p>}
    </div>
  );
}

export function Breadcrumb({ children, href = "/", back = "Trang chủ", parent }) {
  return (
    <div className="breadcrumb">
      <Link href={href}>{back}</Link>
      {parent && (
        <>
          <span aria-hidden="true">/</span>
          <Link href={parent.href}>{parent.label}</Link>
        </>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">{children}</span>
    </div>
  );
}

export function Pager({ meta, page, onPage, count = 0 }) {
  const pages =
    meta.total != null
      ? Math.max(1, Math.ceil(meta.total / (meta.limit || 20)))
      : null;
  return (
    (pages > 1 || page > 1 || (!pages && count === 20)) && (
      <nav className="pagination" aria-label="Phân trang">
        <button
          className="btn secondary sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          Trước
        </button>
        <span>
          Trang {page}
          {pages ? ` / ${pages}` : ""}
        </span>
        <button
          className="btn secondary sm"
          onClick={() => onPage(page + 1)}
          disabled={pages ? page >= pages : count < 20}
        >
          Tiếp
        </button>
      </nav>
    )
  );
}

export function RecordId({ value }) {
  return (
    <span className="record-id" title={value}>
      {shortId(value)}
    </span>
  );
}
