"use client";

import Link from "next/link";
import { money } from "@/lib/api.mjs";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";

export function ListingCard({ listing, eager = false }) {
  const href = `/listings/${listing.listingId}`;
  return (
    <article className="card">
      <Link href={href} aria-label={`Xem ${listing.title}`}>
        <div className="art-frame">
          <Photo id={listing.imageIds?.[0]} title={listing.title} variant="card" loading={eager ? "eager" : "lazy"} />
          <span className="art-meta">
            <Icon name="leaf" size={11} />
            {listing.condition}
          </span>
        </div>
      </Link>
      <div className="card-copy">
        <p className="eyebrow">
          {listing.category} ·{" "}
          {listing.size === "FREE_SIZE" ? "Freesize" : `Size ${listing.size}`}
        </p>
        <h3>
          <Link href={href}>{listing.title}</Link>
        </h3>
        <p className="small muted m0">Mỗi món một chiếc</p>
        <div className="row between">
          <span className="price">{money(listing.price)}</span>
          <Icon name="arrow" size={15} />
        </div>
      </div>
    </article>
  );
}
