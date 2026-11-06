import { Badge } from "@/components/ui/Badge";
import { AuditTrail } from "./AuditTrail";

export function CaseTimeline({ support, entries, decisions }) {
  return (
    <section className="panel">
      <h2>{support ? "Các mốc xử lý" : "Lịch sử truy vết"}</h2>
      <AuditTrail entries={entries} />
      {decisions?.map((decision, i) => (
        <div className="audit" key={i}>
          <Badge value={decision.toStatus} />
          <p>{decision.outcomeSummary}</p>
          {decision.internalNote && (
            <p>Ghi chú nội bộ: {decision.internalNote}</p>
          )}
        </div>
      ))}
    </section>
  );
}
