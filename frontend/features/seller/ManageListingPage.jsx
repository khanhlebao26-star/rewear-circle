"use client";

import Link from "next/link";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { ErrorState, Notice, Resource } from "@/components/ui/Feedback";
import { date, latestVersion } from "@/lib/api.mjs";
import { ListingStatus } from "@/features/seller/ListingStatus";
import { ListingVersionContent } from "@/features/listings/ListingVersionContent";
import {
  canEditListing,
  ListingEditorPage,
} from "@/features/seller/ListingEditorPage";

export function ManageListingPage({ id, mode }) {
  const resource = useResource(
    `/me/listings/${id}${mode === "revisions" ? "/revisions" : ""}`,
  );
  const listing = resource.data;
  const mutation = useMutation();
  async function visibility() {
    if (
      await mutation.run(`/listings/${id}/visibility`, {
        action: listing.sellerHidden ? "SHOW" : "HIDE",
      })
    )
      resource.reload();
  }
  return (
    <Resource resource={resource}>
      {listing &&
        (mode === "edit" ? (
          <ListingEditorPage key={listing.updatedAt} listing={listing} />
        ) : mode === "revisions" ? (
          <>
            <Breadcrumb href={`/me/listings/${id}`} back="Quản lý tin">
              Lịch sử phiên bản
            </Breadcrumb>
            <Heading
              eyebrow="BẢN GỬI & QUYẾT ĐỊNH"
              title="Mỗi lần sửa, một phiên bản."
              description={`Đã dùng ${listing.resubmissionsUsed} / 5 lượt gửi lại. Còn ${listing.resubmissionsRemaining} lượt.`}
            />
            <div className="stack">
              {listing.versions.toReversed().map((version, i) => (
                <section className="panel" key={version._id}>
                  <div className="panel-title">
                    <h2>
                      Phiên bản {listing.versions.length - i} · {version.title}
                    </h2>
                    <Badge value={version.status} />
                  </div>
                  <p className="caption">
                    Gửi {date(version.submittedAt)} · Duyệt{" "}
                    {date(version.reviewedAt)}
                  </p>
                  {version.rejectionReason && (
                    <Notice tone="red">{version.rejectionReason}</Notice>
                  )}
                  <details className="mt">
                    <summary>Xem nội dung phiên bản</summary>
                    <ListingVersionContent version={version} />
                  </details>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <Breadcrumb href="/me/listings" back="Tủ đồ của tôi">
              Quản lý tin
            </Breadcrumb>
            <Heading
              eyebrow="TIN ĐĂNG CỦA BẠN"
              title={latestVersion(listing).title}
              description={`Tin ${id}`}
            />
            <div className="mb">
              <ListingStatus listing={listing} />
            </div>
            <div className="two-col">
              <section className="panel">
                <ListingVersionContent version={latestVersion(listing)} />
              </section>
              <aside className="stack">
                <section className="panel">
                  <h2>Trạng thái tin đăng</h2>
                  {listing.reviewHold && (
                    <Notice tone="amber">
                      Tin tạm ngưng công khai trong lúc chờ duyệt hoặc sửa thông
                      tin.
                    </Notice>
                  )}
                  {(listing.correctionReason ||
                    latestVersion(listing).rejectionReason) && (
                    <p className="description">
                      {listing.correctionReason ||
                        latestVersion(listing).rejectionReason}
                    </p>
                  )}
                  {listing.adminHidden && (
                    <Notice tone="red">
                      Admin đã ẩn: {listing.adminHiddenReason}
                    </Notice>
                  )}
                  {listing.paymentReviewHold && (
                    <Notice tone="amber">
                      Tin đang bị giữ do rà soát thanh toán.
                    </Notice>
                  )}
                  <div className="stack mt">
                    {canEditListing(listing) && (
                      <Link className="btn" href={`/me/listings/${id}/edit`}>
                        Gửi phiên bản sửa
                      </Link>
                    )}
                    <Link
                      className="btn secondary"
                      href={`/me/listings/${id}/revisions`}
                    >
                      Lịch sử phiên bản
                    </Link>
                    <button
                      className="btn secondary"
                      disabled={mutation.pending}
                      onClick={visibility}
                    >
                      {listing.sellerHidden ? "Hiện lại tin" : "Ẩn tin của tôi"}
                    </button>
                    {mutation.error && (
                      <ErrorState
                        error={mutation.error}
                        reload={resource.reload}
                      />
                    )}
                  </div>
                </section>
                <Notice tone="gray">
                  Hiện lại chỉ thành công khi tin đủ điều kiện. Duyệt phiên bản
                  không tự gỡ cờ ẩn.
                </Notice>
              </aside>
            </div>
          </>
        ))}
    </Resource>
  );
}
