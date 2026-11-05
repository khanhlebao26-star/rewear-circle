"use client";

import { useRef, useState } from "react";
import { ErrorState } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";
import { api } from "@/lib/api.mjs";

export function EvidenceUpload({ purpose = "LISTING", ids, onChange, onBusy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const uploading = useRef(false);
  async function upload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || uploading.current) return;
    if (
      files.length + ids.length > 5 ||
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024,
      )
    ) {
      setError(
        new Error(
          "Chọn tối đa 5 ảnh JPG, PNG hoặc WebP, mỗi ảnh không quá 5 MB.",
        ),
      );
      return;
    }
    uploading.current = true;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("purpose", purpose);
      files.forEach((file) => body.append("images", file));
      const result = await api("/media/upload-requests", {
        method: "POST",
        body,
      });
      onChange([...ids, ...result.data.map((file) => file.mediaId)]);
    } catch (failure) {
      setError(failure);
    } finally {
      uploading.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div>
      {error && <ErrorState error={error} />}
      <label className="upload-zone">
        <Icon name="upload" size={26} />
        <strong>{busy ? "Đang tải ảnh…" : "Chọn ảnh để tải lên"}</strong>
        <span>JPG, PNG, WebP · tối đa 5 MB / ảnh · {ids.length}/5 ảnh</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || ids.length >= 5}
          onChange={upload}
        />
      </label>
      {ids.length > 0 && (
        <div className="upload-previews">
          {ids.map((id, index) => (
            <div key={id}>
              <Photo id={id} title={`Ảnh ${index + 1}`} />
              <button
                type="button"
                className="icon-btn"
                disabled={busy}
                onClick={() => onChange(ids.filter((value) => value !== id))}
                aria-label={`Bỏ ảnh ${index + 1}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
