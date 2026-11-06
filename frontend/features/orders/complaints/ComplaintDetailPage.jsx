"use client";

import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Gallery } from "@/components/ui/Gallery";
import { Notice, Resource } from "@/components/ui/Feedback";
import { date, label, reasons } from "@/lib/api.mjs";
import { ComplaintHeading } from "./ComplaintHeading";

export function ComplaintDetailPage({ id, complaintId }) {
  const resource = useResource(`/orders/${id}/complaints/${complaintId}`);
  const complaint = resource.data;

  return (
    <>
      <ComplaintHeading id={id} title="Bản khiếu nại của bạn" />
      <Resource resource={resource}>
        {complaint && (
          <div className="two-col">
            <section className="panel">
              <div className="panel-title">
                <h2>{label(complaint.type)}</h2>
                <Badge value={complaint.caseStatus} />
              </div>
              <h3>{reasons[complaint.type]?.[complaint.reasonCode]}</h3>
              <p className="description">{complaint.details}</p>
              <p className="caption">Đã gửi {date(complaint.receivedAt)}</p>
              <div className="evidence">
                {complaint.evidenceMediaIds.map((image) => (
                  <Gallery
                    key={image}
                    ids={[image]}
                    title="Bằng chứng của bạn"
                  />
                ))}
              </div>
              {complaint.caseStatus === "CLOSED" && (
                <div className="mt">
                  <Notice>
                    <strong>{label(complaint.outcomeCode)}</strong>
                    <p>{complaint.outcomeSummary}</p>
                  </Notice>
                </div>
              )}
            </section>
            <aside className="panel">
              <h2>Tiến trình</h2>
              <ol className="timeline mt">
                <li>
                  <div>
                    <strong>Đã tiếp nhận</strong>
                    <small>{date(complaint.receivedAt)}</small>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{label(complaint.caseStatus)}</strong>
                    <small>
                      {complaint.closedAt
                        ? date(complaint.closedAt)
                        : "Chờ cập nhật kết quả"}
                    </small>
                  </div>
                </li>
              </ol>
            </aside>
          </div>
        )}
      </Resource>
    </>
  );
}
