import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ListingCard } from "@/features/listings/ListingCard";
import { getPublicListingData } from "@/lib/publicListingData";
import styles from "./RelatedListings.module.css";

export async function RelatedListings({ category, listingId }) {
  const categoryQuery = new URLSearchParams({ category });
  const { data = [] } = await getPublicListingData(`/listings?${categoryQuery}&limit=5`);
  const related = data.filter((listing) => listing.listingId !== listingId).slice(0, 4);
  if (!related.length) return null;

  return (
    <section className={styles.section} aria-labelledby="related-listings-title">
      <div className={`title-row ${styles.heading}`}>
        <div>
          <h2 id="related-listings-title">Những món tương tự</h2>
          <p className="small muted m0">Xem thêm các món đang bán trong danh mục {category}.</p>
        </div>
        <Link href={`/listings?${categoryQuery}`} className="view-all">
          Khám phá thêm <Icon name="arrow" size={14} />
        </Link>
      </div>
      <div className={`grid ${styles.cards}`}>
        {related.map((listing) => (
          <ListingCard key={listing.listingId} listing={listing} />
        ))}
      </div>
    </section>
  );
}
