"use client";

import Link from "next/link";
import { useState } from "react";
import useResource from "@/hooks/useResource";
import { Badge } from "@/components/ui/Badge";
import { Pager, RecordId } from "@/components/ui/PageNavigation";
import { Empty, Resource } from "@/components/ui/Feedback";
import { date, label } from "@/lib/api.mjs";
import { ComplaintHeading } from "./ComplaintHeading";

export function ComplaintListPage({ id }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const query = new URLSearchParams({ page, limit: 20 });
  if (status) query.set("status", status);
  if (typeFilter) query.set("type", typeFilter);
  const resource = useResource(`/orders/${id}/complaints?${query}`);

  return (
    <>
      <ComplaintHeading id={id} title="Khiếu nại của bạn" />
      <Resource resource={resource}>
        <>
          <div className="table-filter">
            <select
              aria-label="Trạng thái khiếu nại"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {["OPEN", "IN_REVIEW", "CLOSED"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <select
              aria-label="Loại khiếu nại"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả loại</option>
              {["DELIVERY", "ITEM"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </div>
          {resource.data?.length ? (
            <>
              <div className="stack">
                {resource.data.map((record) => (
                  <section className="panel" key={record.complaintId}>
                    <div className="row between wrap">
                      <h3>
                        <RecordId value={record.complaintId} /> ·{" "}
                        {label(record.type)}
                      </h3>
                      <Badge value={record.caseStatus} />
                    </div>
                    <p className="caption">{date(record.receivedAt)}</p>
                    <Link
                      className="link"
                      href={`/orders/${id}/complaints/${record.complaintId}`}
                    >
                      Xem bản đã gửi →
                    </Link>
                  </section>
                ))}
              </div>
              <Pager meta={resource.meta} page={page} onPage={setPage} />
            </>
          ) : (
            <Empty
              title="Chưa có bản khiếu nại phù hợp."
              href={`/orders/${id}`}
              action="Về chi tiết đơn"
              icon="flag"
            />
          )}
        </>
      </Resource>
    </>
  );
}
