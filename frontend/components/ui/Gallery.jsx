"use client";

import { useState } from "react";
import { Photo } from "@/components/ui/Photo";
import { Modal } from "@/components/ui/Modal";

export function Gallery({ ids = [], title, query = "", listingPhotos = false, priority = false }) {
  const [selected, setSelected] = useState(0);
  const [large, setLarge] = useState(false);
  return (
    <div>
      <button
        className="large-art gallery-main"
        onClick={() => setLarge(true)}
        aria-label={`Phóng to ảnh ${title}`}
      >
        <Photo id={ids[selected]} title={title} query={query} variant={listingPhotos ? "detail" : undefined} priority={priority && selected === 0} />
      </button>
      {ids.length > 1 && (
        <div className="thumbs">
          {ids.map((id, i) => (
            <button
              key={id}
              className={selected === i ? "active" : ""}
              onClick={() => setSelected(i)}
              aria-label={`Xem ảnh ${i + 1}`}
            >
              <Photo id={id} title={title} query={query} variant={listingPhotos ? "thumbnail" : undefined} />
            </button>
          ))}
        </div>
      )}
      {large && (
        <Modal title={title} onClose={() => setLarge(false)}>
          <div className="photo-lightbox">
            <Photo id={ids[selected]} title={title} query={query} />
          </div>
        </Modal>
      )}
    </div>
  );
}
