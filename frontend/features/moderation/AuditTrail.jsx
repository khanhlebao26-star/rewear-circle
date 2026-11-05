"use client";

import { date } from "@/lib/api.mjs";

export function AuditTrail({ entries = [] }) {
  return entries.length ? (
    entries.map((entry, i) => (
      <div className="audit" key={entry._id || i}>
        <strong>
          {entry.action || entry.status || entry.toStatus || "Cập nhật"}
        </strong>{" "}
        · {date(entry.createdAt || entry.at)}
        {entry.reason && <p>{entry.reason}</p>}
        {entry.toState && <span> · {entry.toState}</span>}
      </div>
    ))
  ) : (
    <p className="caption">Chưa có mốc xử lý bổ sung.</p>
  );
}
