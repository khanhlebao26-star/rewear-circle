"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@/hooks/useMutation";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Notice } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Icon } from "@/components/ui/Icon";
import { categories, conditions, latestVersion } from "@/lib/api.mjs";
import { EvidenceUpload } from "@/components/ui/EvidenceUpload";

export function canEditListing(listing) {
  return (
    listing.saleStatus !== "SOLD" &&
    !listing.versions.some((version) => version.status === "PENDING") &&
    !(
      (latestVersion(listing)?.status === "REJECTED" ||
        listing.correctionRequested) &&
      listing.resubmissionCount >= 5
    )
  );
}

export function ListingEditorPage({ listing }) {
  const version = latestVersion(listing) || {};
  const [category, setCategory] = useState(version.category || "Áo");
  const [images, setImages] = useState(version.imageIds || []);
  const [uploading, setUploading] = useState(false);
  const mutation = useMutation();
  const router = useRouter();
  async function submit(event) {
    event.preventDefault();
    if (uploading) return;
    if (!images.length) {
      mutation.setError(new Error("Cần ít nhất một ảnh món đồ."));
      return;
    }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      title: values.title.trim(),
      category,
      size: values.size,
      condition: values.condition,
      description: values.description.trim(),
      flaws: values.flaws.trim(),
      price: Number(values.price),
      shipFrom: values.shipFrom.trim(),
      imageIds: images,
    };
    const result = await mutation.run(
      listing ? `/listings/${listing._id}/revisions` : "/listings",
      payload,
    );
    if (result) router.push(`/me/listings/${result.data.listingId}`);
  }
  if (listing && !canEditListing(listing))
    return (
      <Empty
        title="Tin chưa thể gửi phiên bản mới."
        href={`/me/listings/${listing._id}`}
        action="Về quản lý tin"
      >
        Kiểm tra bản đang chờ duyệt, trạng thái đã bán và giới hạn gửi lại.
      </Empty>
    );
  return (
    <>
      <Breadcrumb href="/me/listings" back="Tủ đồ của tôi">
        {listing ? "Gửi bản sửa" : "Đăng bán"}
      </Breadcrumb>
      <Heading
        eyebrow="MẶC TIẾP · TRAO ĐI"
        title={
          listing
            ? "Chỉnh lại, để món đồ được kể đúng."
            : "Món đồ của bạn, câu chuyện tiếp theo."
        }
        description="Điền đúng thông tin và mô tả rõ lỗi. Tin chỉ công khai sau khi được Admin duyệt."
      />
      <form className="two-col" onSubmit={submit}>
        <div className="stack">
          <section className="panel">
            <div className="panel-title">
              <h2>01 / Ảnh món đồ</h2>
              <span className="small muted">1–5 ảnh</span>
            </div>
            <EvidenceUpload
              ids={images}
              onChange={setImages}
              onBusy={setUploading}
            />
          </section>
          <section className="panel">
            <h2>02 / Thông tin món đồ</h2>
            {mutation.error && <ErrorState error={mutation.error} />}
            <Field
              label="Tên món đồ *"
              name="title"
              defaultValue={version.title}
              minLength={5}
              maxLength={100}
              required
            />
            <div className="form-grid">
              <SelectField
                label="Danh mục *"
                name="category"
                values={Object.keys(categories)}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
              />
              <SelectField
                key={category}
                label="Kích cỡ *"
                name="size"
                values={categories[category]}
                defaultValue={category === version.category ? version.size : ""}
                placeholder="Chọn kích cỡ"
                required
              />
            </div>
            <SelectField
              label="Tình trạng *"
              name="condition"
              values={
                conditions.includes(version.condition) || !version.condition
                  ? conditions
                  : [version.condition, ...conditions]
              }
              defaultValue={version.condition || ""}
              placeholder="Chọn tình trạng"
              required
            />
            <Field label="Mô tả *">
              <textarea
                name="description"
                defaultValue={version.description}
                minLength={20}
                maxLength={2000}
                required
              />
            </Field>
            <Field label="Thông tin lỗi / lưu ý">
              <textarea
                name="flaws"
                defaultValue={version.flaws}
                maxLength={1000}
              />
            </Field>
            <div className="form-grid">
              <Field
                label="Giá bán (VND) *"
                name="price"
                type="number"
                defaultValue={version.price}
                min={20000}
                max={5000000}
                step={1}
                required
              />
              <Field
                label="Khu vực gửi hàng *"
                name="shipFrom"
                defaultValue={version.shipFrom}
                maxLength={100}
                required
              />
            </div>
            <p className="caption">
              Giá từ 20.000–5.000.000 ₫. Người bán tính phí vận chuyển trong giá
              niêm yết.
            </p>
          </section>
        </div>
        <aside className="panel preview-listing">
          <p className="eyebrow">TRƯỚC KHI GỬI DUYỆT</p>
          <h2>
            Thông tin rõ ràng,
            <br />
            vòng tròn bền lâu.
          </h2>
          <ul className="note-list">
            <li>Ảnh và mô tả khớp món thực tế.</li>
            <li>Khai báo lỗi và tình trạng hiện tại.</li>
            <li>Mỗi món chỉ có một phiên bản chờ duyệt.</li>
            {listing && (
              <li>
                Đã dùng {listing.resubmissionCount || 0} / 5 lượt gửi lại khi bị
                từ chối hoặc yêu cầu sửa.
              </li>
            )}
          </ul>
          <Notice tone="gray">
            Phiên bản mới cần Admin duyệt. Bản lưu trong đơn đã tạo được giữ
            nguyên.
          </Notice>
          <button
            className="btn full mt"
            disabled={mutation.pending || uploading}
          >
            {mutation.pending ? "Đang gửi…" : "Gửi tin chờ duyệt"}
            <Icon name="arrow" size={15} />
          </button>
          <Link className="link mt" href="/me/listings">
            Quay về tủ đồ
          </Link>
        </aside>
      </form>
    </>
  );
}
