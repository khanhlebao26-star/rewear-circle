"use client";

import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Rewear Circle, trang chủ">
      <i>r</i>
      <span>
        rewear<span>circle</span>
      </span>
    </Link>
  );
}
