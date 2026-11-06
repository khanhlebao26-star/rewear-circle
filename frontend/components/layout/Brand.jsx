"use client";

import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Rewear Circle, trang chủ">
      <img
        className="brand-mark"
        src="/rewear-circle-mark.png"
        alt=""
        width={37}
        height={37}
      />
      <span>
        rewear<span>circle</span>
      </span>
    </Link>
  );
}
