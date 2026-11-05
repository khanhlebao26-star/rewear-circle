"use client";

import { Gallery } from "@/components/ui/Gallery";
import { money } from "@/lib/api.mjs";

export function ListingVersionContent({ version }) {
  return (
    <>
      <Gallery ids={version.imageIds} title={version.title} listingPhotos />
      <div className="facts">
        <div>
          <span>Danh mục</span>
          <strong>{version.category}</strong>
        </div>
        <div>
          <span>Kích cỡ</span>
          <strong>
            {version.size === "FREE_SIZE" ? "Freesize" : version.size}
          </strong>
        </div>
        <div>
          <span>Tình trạng</span>
          <strong>{version.condition}</strong>
        </div>
      </div>
      <h3>Mô tả</h3>
      <p className="description">{version.description}</p>
      <h3>Thông tin lỗi / lưu ý</h3>
      <p className="description">
        {version.flaws || "Không có thông tin bổ sung."}
      </p>
      <dl className="kv">
        <dt>Giá niêm yết</dt>
        <dd>{money(version.price)}</dd>
        <dt>Gửi từ</dt>
        <dd>{version.shipFrom}</dd>
      </dl>
    </>
  );
}
