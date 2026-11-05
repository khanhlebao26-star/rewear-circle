"use client";

import Link from "next/link";
import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Heading, Pager, RecordId } from "@/components/ui/PageNavigation";
import { Photo } from "@/components/ui/Photo";
import { ModerationTable } from "@/features/moderation/ModerationTable";
import { money } from "@/lib/api.mjs";
import styles from "./ListingManagementPage.module.css";

const visibilityOptions = {
  PUBLIC: "Công khai",
  HIDDEN: "Đã ẩn",
  UNPUBLISHED: "Chưa công khai",
};

export function ListingManagementPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const query = new URLSearchParams({ page, limit: 20, ...filters });
  const resource = useResource(`/admin/listings?${query}`);

  function applyFilters(event) {
    event.preventDefault();
    const next = {};
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (value.trim()) next[key] = value.trim();
    }
    setPage(1);
    setFilters(next);
  }

  return (
    <>
      <Heading
        eyebrow="KIỂM DUYỆT TIN ĐĂNG"
        title="Quản lý tin đăng"
        description="Tra cứu toàn bộ tin đăng và theo dõi trạng thái của từng món."
      />
      <form className="table-filter" onSubmit={applyFilters}>
        <Field label="Tìm tin đăng" name="q" type="search" maxLength={100} placeholder="Tên hoặc mã tin" />
        <SelectField label="Trạng thái duyệt" name="reviewStatus" values={["PENDING", "APPROVED", "REJECTED"]} placeholder="Tất cả" />
        <SelectField label="Hiển thị" name="visibility" values={Object.entries(visibilityOptions)} placeholder="Tất cả" />
        <button className="btn secondary sm">Áp dụng</button>
      </form>
      <Resource resource={resource}>
        {resource.data?.length ? (
          <ModerationTable headings={["TIN ĐĂNG", "NGƯỜI BÁN", "GIÁ", "DUYỆT", "HIỂN THỊ", ""]}>
            {resource.data.map((listing, index) => {
              const title = listing.title || "Tin chưa có phiên bản";
              return (
                <tr key={listing.listingId}>
                  <td>
                    <div className="row">
                      <div className={`mini-art ${styles.thumbnail}`}>
                        <Photo id={listing.imageId} title={title} variant="thumbnail" loading={index < 4 ? "eager" : "lazy"} />
                      </div>
                      <div>
                        <strong>{title}</strong>
                        <p className="caption"><RecordId value={listing.listingId} /></p>
                      </div>
                    </div>
                  </td>
                  <td>{listing.sellerName || "—"}</td>
                  <td>{listing.price != null ? money(listing.price) : "—"}</td>
                  <td>{listing.reviewStatus ? <Badge value={listing.reviewStatus} /> : "—"}</td>
                  <td>
                    <div className="row wrap">
                      <Badge tone={listing.visibility === "PUBLIC" ? undefined : "gray"}>
                        {visibilityOptions[listing.visibility]}
                      </Badge>
                      {(listing.visibility === "PUBLIC" || ["RESERVED", "SOLD"].includes(listing.saleStatus)) && (
                        <Badge value={listing.saleStatus} />
                      )}
                    </div>
                  </td>
                  <td>
                    {listing.versionId && (
                      <Link href={`/admin/listing-management/${listing.versionId}`}>Xem chi tiết →</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </ModerationTable>
        ) : (
          <Empty title="Không tìm thấy tin đăng phù hợp." href={null} icon="search" />
        )}
        <Pager meta={resource.meta} page={page} onPage={setPage} />
      </Resource>
    </>
  );
}
