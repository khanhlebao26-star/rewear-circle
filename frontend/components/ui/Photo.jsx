"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function Photo({ id, title, className = "product-art", query = "", variant, loading, priority }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id, query, variant]);
  const original = `/api/v1/media/${id}${query}`;
  const withWidth = (width) => {
    const params = new URLSearchParams(query);
    params.set("width", width);
    return `/api/v1/media/${id}?${params}`;
  };
  return !id || failed ? (
    <span
      className={`${className} image-placeholder`}
      role="img"
      aria-label={`${title}, ảnh đang cập nhật`}
    >
      <Icon name="hanger" size={55} />
      <span>Ảnh đang cập nhật</span>
    </span>
  ) : (
    <img
      className={className}
      src={variant === "thumbnail" ? withWidth(160) : variant === "card" ? withWidth(320) : original}
      srcSet={variant === "card" ? `${withWidth(320)} 320w, ${withWidth(640)} 640w` : undefined}
      sizes={variant === "card" ? "(max-width: 600px) 50vw, (max-width: 850px) 33vw, (max-width: 1280px) 25vw, 300px" : undefined}
      alt={title}
      loading={loading}
      fetchPriority={priority ? "high" : undefined}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        if (
          event.currentTarget.naturalWidth < 16 ||
          event.currentTarget.naturalHeight < 16
        )
          setFailed(true);
      }}
    />
  );
}
