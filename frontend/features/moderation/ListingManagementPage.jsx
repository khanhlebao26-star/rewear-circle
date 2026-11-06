"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Heading, Pager, RecordId } from "@/components/ui/PageNavigation";
import { Photo } from "@/components/ui/Photo";
import { ModerationTable } from "@/features/moderation/ModerationTable";
import { money } from "@/lib/api.mjs";
import { listingSearchParams, withListingSearch } from "@/lib/listingSearch.mjs";
import styles from "./ListingManagementPage.module.css";

const visibilityOptions = {
  PUBLIC: "Công khai",
  HIDDEN: "Đã ẩn",
  UNPUBLISHED: "Chưa công khai",
};

export function ListingManagementPage({ filters, page }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const search = listingSearchParams(filters, page);
  const query = new URLSearchParams(search);
  query.set("limit", "20");
  const resource = useResource(`/admin/listings?${query}`);

  function navigate(params) {
    startTransition(() => router.push(withListingSearch("/admin/listing-management", params), { scroll: false }));
  }

  function applyFilters(event) {
    event.preventDefault();
    navigate(listingSearchParams(Object.fromEntries(new FormData(event.currentTarget))));
  }

  return (
    <>
      <Heading
        eyebrow="KIỂM DUYỆT TIN ĐĂNG"
        title="Quản lý tin đăng"
        description="Tra cứu toàn bộ tin đăng và theo dõi trạng thái của từng món."
      />
      <form key={JSON.stringify(filters)} className="table-filter" onSubmit={applyFilters}>
        <Field label="Tìm tin đăng" name="q" type="search" maxLength={100} placeholder="Tên hoặc mã tin" defaultValue={filters.q} />
        <SelectField label="Trạng thái duyệt" name="reviewStatus" values={["PENDING", "APPROVED", "REJECTED"]} placeholder="Tất cả" defaultValue={filters.reviewStatus} />
        <SelectField label="Hiển thị" name="visibility" values={Object.entries(visibilityOptions)} placeholder="Tất cả" defaultValue={filters.visibility} />
        <button className="btn secondary sm" disabled={pending}>Áp dụng</button>
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
                      <Link href={withListingSearch(`/admin/listing-management/${listing.versionId}`, search)}>Xem chi tiết →</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </ModerationTable>
        ) : (
          <Empty title="Không tìm thấy tin đăng phù hợp." href={null} icon="search" />
        )}
        <Pager meta={resource.meta} page={page} onPage={(number) => navigate(listingSearchParams(filters, number))} disabled={pending} />
      </Resource>
    </>
  );
}
