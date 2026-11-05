"use client";

import Link from "next/link";
import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Empty, Resource } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/FormFields";
import { Heading, RecordId, Pager } from "@/components/ui/PageNavigation";
import { reasons } from "@/lib/api.mjs";
import { ModerationTable } from "@/features/moderation/ModerationTable";

export function CasesPage({ support }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const prefix = support ? "/support" : "/admin";
  const query = new URLSearchParams({ page, limit: 20, ...filters });
  const resource = useResource(`${prefix}/cases?${query}`);
  function filter(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {};
    ["type", "status", "assignedSupportId"].forEach((key) => {
      if (form.get(key)?.trim()) next[key] = form.get(key).trim();
    });
    if (form.has("unassigned")) {
      delete next.assignedSupportId;
      next.unassigned = "true";
    }
    setFilters(next);
    setPage(1);
  }
  return (
    <>
      <Heading
        eyebrow={support ? "NHÂN VIÊN HỖ TRỢ" : "BÁO CÁO & KHIẾU NẠI"}
        title={support ? "Vụ việc được giao" : "Danh sách vụ việc"}
        description={
          support
            ? "Chỉ các vụ đang mở được giao cho bạn. Quyền xem kết thúc khi đóng vụ hoặc đổi phân công."
            : "Báo cáo tin, giao nhận và khiếu nại món được nhóm theo đúng mục tiêu."
        }
      />
      <form className="table-filter" onSubmit={filter}>
        <SelectField
          label="Loại vụ"
          name="type"
          values={["REPORT", "DELIVERY", "ITEM"]}
          placeholder="Tất cả loại vụ"
        />
        <SelectField
          label="Trạng thái"
          name="status"
          values={
            support ? ["OPEN", "IN_REVIEW"] : ["OPEN", "IN_REVIEW", "CLOSED"]
          }
          placeholder="Tất cả trạng thái"
        />
        {!support && (
          <>
            <Field
              label="Mã Support được giao"
              name="assignedSupportId"
              pattern="[a-fA-F0-9]{24}"
              maxLength={24}
            />
            <label className="check-label">
              <input type="checkbox" name="unassigned" />
              Chưa phân công
            </label>
          </>
        )}
        <button className="btn secondary sm">Áp dụng</button>
      </form>
      <Resource resource={resource}>
        {resource.data?.length ? (
          <>
            <ModerationTable
              headings={[
                "MÃ VỤ / MỤC TIÊU",
                "LOẠI VỤ",
                "TRẠNG THÁI",
                "BẢN GỐC",
                ...(!support ? ["PHÂN CÔNG"] : []),
                "",
              ]}
            >
              {resource.data.map((record) => (
                <tr key={record.caseId || record._id}>
                  <td>
                    <strong>
                      <RecordId value={record.caseId || record._id} />
                    </strong>
                    <p className="caption">
                      <RecordId value={record.targetId} />
                    </p>
                  </td>
                  <td>
                    {reasons[record.type]
                      ? {
                          REPORT: "Báo cáo tin bán",
                          DELIVERY: "Giao nhận",
                          ITEM: "Món đã nhận",
                        }[record.type]
                      : record.type}
                  </td>
                  <td>
                    <Badge value={record.status} />
                  </td>
                  <td>
                    {record.type === "REPORT"
                      ? record.reportCount
                      : record.complaintCount}
                  </td>
                  {!support && (
                    <td>
                      {record.assignedSupportId ? (
                        <RecordId value={record.assignedSupportId} />
                      ) : (
                        "Chưa giao"
                      )}
                    </td>
                  )}
                  <td>
                    <Link
                      className="link"
                      href={`${prefix}/cases/${record.caseId || record._id}`}
                    >
                      Xem chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
            </ModerationTable>
            <Pager meta={resource.meta} page={page} onPage={setPage} />
          </>
        ) : (
          <Empty
            title={
              support
                ? "Chưa có vụ đang mở được giao cho bạn."
                : "Không có vụ việc phù hợp."
            }
            href={null}
            icon="flag"
          />
        )}
      </Resource>
    </>
  );
}
