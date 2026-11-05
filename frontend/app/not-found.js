import { Empty } from "@/components/ui/Feedback";

export default function NotFound() {
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <div className="page-heading">
        <p className="eyebrow">404 · KHÔNG TÌM THẤY</p>
      </div>
      <Empty title="Trang này không còn hiển thị." icon="hanger">
        Bạn có thể tiếp tục tìm món đồ tại trang khám phá.
      </Empty>
    </main>
  );
}
