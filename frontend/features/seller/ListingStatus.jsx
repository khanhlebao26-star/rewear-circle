"use client";

import { Badge } from "@/components/ui/Badge";
import { latestVersion } from "@/lib/api.mjs";

export function ListingStatus({ listing }) {
  return (
    <div className="row wrap">
      {(latestVersion(listing)?.status === "APPROVED" ||
        listing.saleStatus === "SOLD") && <Badge value={listing.saleStatus} />}
      <Badge value={latestVersion(listing)?.status} />
      {listing.sellerHidden && <Badge tone="gray">Bạn đã ẩn</Badge>}
      {listing.adminHidden && <Badge tone="red">Admin đã ẩn</Badge>}
      {listing.correctionRequested && (
        <Badge tone="amber">Yêu cầu sửa tin</Badge>
      )}
    </div>
  );
}
