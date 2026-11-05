"use client";

import { useState } from "react";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { useSession } from "@/components/layout/AppShell";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Notice, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Icon } from "@/components/ui/Icon";
import { ItemRow } from "@/components/ui/ItemRow";
import { reasons } from "@/lib/api.mjs";
import { EvidenceUpload } from "@/components/ui/EvidenceUpload";

export function ListingReportPage({ id }) {
  const resource = useResource(`/listings/${id}`);
  const mutation = useMutation();
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const session = useSession();
  async function submit(event) {
    event.preventDefault();
    if (uploading) return;
    const form = new FormData(event.currentTarget);
    if (
      await mutation.run("/reports/listings", {
        listingId: id,
        reasonCode: reason,
        details: form.get("details").trim(),
        evidenceMediaIds: images,
      })
    ) {
      setDone(true);
      session.refreshNotifications();
    }
  }
  return (
    <>
      <Breadcrumb href={`/listings/${id}`} back="Chi tiết món đồ">
        Báo cáo tin
      </Breadcrumb>
      <Heading
        eyebrow="GIỮ VÒNG TRÒN RÕ RÀNG"
        title="Báo cáo tin bán"
        description="Cho biết thông tin sai, thiếu hoặc đáng ngờ bạn phát hiện."
      />
      {done ? (
        <Empty
          title="Đã tiếp nhận báo cáo của bạn."
          href="/me/notifications"
          action="Xem thông báo"
          icon="check"
        >
          Kết quả tóm tắt sẽ được gửi trong thông báo của bạn.
        </Empty>
      ) : (
        <Resource resource={resource}>
          {resource.data && (
            <div className="two-col">
              <form className="panel" onSubmit={submit}>
                {mutation.error && <ErrorState error={mutation.error} />}
                <SelectField
                  label="Lý do báo cáo *"
                  name="reasonCode"
                  values={Object.entries(reasons.REPORT)}
                  placeholder="Chọn lý do"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Field
                  label={`Thông tin bổ sung${reason === "OTHER" ? " *" : ""}`}
                >
                  <textarea
                    name="details"
                    maxLength={2000}
                    required={reason === "OTHER"}
                  />
                </Field>
                <EvidenceUpload
                  purpose="CASE_EVIDENCE"
                  ids={images}
                  onChange={setImages}
                  onBusy={setUploading}
                />
                <button
                  className="btn full mt"
                  disabled={mutation.pending || uploading}
                >
                  Gửi báo cáo <Icon name="flag" size={15} />
                </button>
              </form>
              <aside className="stack">
                <section className="panel">
                  <ItemRow item={resource.data} />
                </section>
                <Notice tone="gray">
                  Tối đa 5 báo cáo trong 24 giờ. Bạn sẽ nhận thông báo tiếp nhận
                  và kết quả tóm tắt.
                </Notice>
              </aside>
            </div>
          )}
        </Resource>
      )}
    </>
  );
}
