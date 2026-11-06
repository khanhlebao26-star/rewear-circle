"use client";

import { useEffect, useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb, Heading, RecordId } from "@/components/ui/PageNavigation";
import { Resource } from "@/components/ui/Feedback";
import { CaseActions } from "./CaseActions";
import { CaseContactDialog } from "./CaseContactDialog";
import { CaseContent } from "./CaseContent";
import { CaseTimeline } from "./CaseTimeline";

export function CaseDetailPage({ id, support }) {
  const resource = useResource(`/${support ? "support" : "admin"}/cases/${id}`);
  const [contact, setContact] = useState(false);
  const value = resource.data;
  const record = value?.case;
  const report = record?.type === "REPORT";
  const closed = record?.status === "CLOSED";
  useEffect(() => {
    const refresh = () => {
      setContact(false);
      resource.reload();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [id]);
  return (
    <>
      <Breadcrumb
        href={`/${support ? "support" : "admin"}/cases`}
        back={support ? "Vụ được giao" : "Danh sách vụ việc"}
      >
        Chi tiết vụ
      </Breadcrumb>
      <Heading
        eyebrow={report ? "BÁO CÁO TIN BÁN" : "KHIẾU NẠI ĐƠN HÀNG"}
        title={<RecordId value={id} />}
        action={
          <button
            className="btn secondary sm"
            onClick={() => {
              setContact(false);
              resource.reload();
            }}
          >
            Cập nhật
          </button>
        }
      />
      <Resource resource={resource}>
        {record && (
          <>
            <div className="case-strip">
              <Badge value={record.status} />
              <span>
                Mục tiêu <RecordId value={record.targetId} />
              </span>
              <span>
                Phân công:{" "}
                {record.assignedSupportId ? (
                  <RecordId value={record.assignedSupportId} />
                ) : (
                  "Chưa giao"
                )}
              </span>
            </div>
            <div className="two-col">
              <div className="stack">
                <CaseContent
                  listing={value.listing}
                  order={value.order}
                  entries={value.reports || value.complaints || []}
                  type={record.type}
                  support={support}
                  reload={resource.reload}
                />
                {!report && !closed && (
                  <section className="panel">
                    <h2>Thông tin liên hệ người nhận</h2>
                    <p className="small muted">
                      Cần nêu lý do cho từng lần đọc thông tin liên hệ của đơn.
                    </p>
                    <button
                      className="btn secondary"
                      onClick={() => setContact(true)}
                    >
                      Yêu cầu xem liên hệ
                    </button>
                  </section>
                )}
                <CaseTimeline
                  support={support}
                  entries={support ? value.timeline : value.auditHistory}
                  decisions={support ? undefined : record.decisions}
                />
              </div>
              <CaseActions
                record={record}
                support={support}
                closed={closed}
                report={report}
                reload={resource.reload}
              />
            </div>
            {contact && !closed && (
              <CaseContactDialog
                id={id}
                support={support}
                onClose={() => setContact(false)}
              />
            )}
          </>
        )}
      </Resource>
    </>
  );
}
