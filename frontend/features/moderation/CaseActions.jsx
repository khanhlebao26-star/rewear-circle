import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Feedback";
import { CaseAssignmentForm } from "./CaseAssignmentForm";
import { CaseDecisionForm } from "./CaseDecisionForm";

export function CaseActions({ record, support, closed, report, reload }) {
  return (
    <aside className="stack">
      {!support && !closed && (
        <>
          <CaseAssignmentForm record={record} reload={reload} />
          <CaseDecisionForm record={record} reload={reload} />
        </>
      )}
      {closed ? (
        <section className="panel">
          <p className="eyebrow">KẾT QUẢ ĐÃ LƯU</p>
          <h2>Vụ việc đã đóng.</h2>
          <Badge value={record.outcomeCode} />
          <p className="description mt">{record.outcomeSummary}</p>
          <p className="caption">Vụ đã đóng không được mở lại.</p>
        </section>
      ) : (
        support && (
          <Notice tone="gray">
            Bạn được đọc nội dung và bằng chứng của vụ được giao.
            Quyết định xử lý thuộc Admin.
          </Notice>
        )
      )}
      <Notice tone="amber">
        {report
          ? "Ẩn / hiện tin là thao tác kiểm duyệt. Không sửa nội dung thay người bán."
          : "Đóng vụ không tự thay đổi thanh toán, hoàn tiền hoặc trạng thái đơn."}
      </Notice>
    </aside>
  );
}
