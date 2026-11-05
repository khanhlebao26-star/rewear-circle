"use client";

import { money } from "@/lib/api.mjs";
import { Photo } from "@/components/ui/Photo";

export function ItemRow({ item, children, query = "", snapshot }) {
  return (
    <div className="item-row">
      <div className="mini-art">
        <Photo
          id={item.imageIds?.[0]}
          title={item.title || "Món không còn khả dụng"}
          query={query}
        />
      </div>
      <div className="grow">
        <h3>{item.title || "Món không còn khả dụng"}</h3>
        <p>
          {item.category} · {item.size === "FREE_SIZE" ? "Freesize" : item.size}{" "}
          · {item.condition}
        </p>
        {snapshot && (
          <details className="snapshot">
            <summary>Xem bản lưu lúc đặt</summary>
            <p>{item.description}</p>
            <p>Lỗi / lưu ý: {item.flaws || "Không có thông tin bổ sung."}</p>
          </details>
        )}
      </div>
      <div className="right">
        <div className="item-price">
          {item.price != null && money(item.price)}
        </div>
        {children}
      </div>
    </div>
  );
}
