"use client";

import Link from "next/link";
import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Heading, RecordId, Pager } from "@/components/ui/PageNavigation";
import { Icon } from "@/components/ui/Icon";
import { ItemRow } from "@/components/ui/ItemRow";
import { latestVersion } from "@/lib/api.mjs";
import { ListingStatus } from "@/features/seller/ListingStatus";

export function SellerClosetPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const resource = useResource(`/me/listings?page=${page}`);
  const visible = (resource.data || []).filter(
    (listing) =>
      !status ||
      (status === "HIDDEN"
        ? listing.sellerHidden || listing.adminHidden
        : status === "PENDING" || status === "REJECTED"
          ? latestVersion(listing)?.status === status
          : listing.saleStatus === status &&
            latestVersion(listing)?.status === "APPROVED" &&
            !listing.sellerHidden &&
            !listing.adminHidden),
  );
  return (
    <>
      <Heading
        eyebrow="TỦ ĐỒ CỦA BẠN"
        title="Trao đi một câu chuyện."
        description="Quản lý tin đăng, các phiên bản và trạng thái bán."
        action={
          <Link className="btn" href="/sell">
            <Icon name="plus" />
            Đăng bán món đồ
          </Link>
        }
      />
      <div className="tabs">
        {[
          ["", "Tất cả"],
          ["AVAILABLE", "Đang bán"],
          ["PENDING", "Chờ duyệt"],
          ["REJECTED", "Từ chối"],
          ["HIDDEN", "Đã ẩn"],
          ["SOLD", "Đã bán"],
        ].map(([value, text]) => (
          <button
            className={`tab ${status === value ? "active" : ""}`}
            key={value}
            onClick={() => setStatus(value)}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="caption">
        Lọc trong các tin của trang {page}. Đổi trang để xem các tin tiếp theo.
      </p>
      <Resource resource={resource}>
        {resource.data?.length ? (
          <>
            <div className="stack">
              {visible.length ? (
                visible.map((listing) => (
                  <article className="panel" key={listing._id}>
                    <ItemRow item={latestVersion(listing)} />
                    <ListingStatus listing={listing} />
                    <div className="row between wrap mt">
                      <span className="caption">
                        Tin <RecordId value={listing._id} /> ·{" "}
                        {listing.versions.length} phiên bản
                      </span>
                      <div className="row">
                        <Link
                          className="btn secondary sm"
                          href={`/me/listings/${listing._id}`}
                        >
                          Quản lý tin
                        </Link>
                        <Link
                          className="link"
                          href={`/me/listings/${listing._id}/revisions`}
                        >
                          Lịch sử
                        </Link>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="Trang này chưa có tin phù hợp."
                  href={null}
                  icon="hanger"
                />
              )}
            </div>
            <Pager
              meta={resource.meta}
              page={page}
              onPage={setPage}
              count={resource.data.length}
            />
          </>
        ) : (
          <Empty
            title="Tủ đồ của bạn còn trống."
            href="/sell"
            action="Đăng bán món đồ"
            icon="hanger"
          />
        )}
      </Resource>
    </>
  );
}
