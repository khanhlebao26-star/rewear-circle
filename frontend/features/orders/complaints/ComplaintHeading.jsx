import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { shortId } from "@/lib/api.mjs";

export function ComplaintHeading({ id, title, breadcrumb = "Bản khiếu nại đã gửi" }) {
  return (
    <>
      <Breadcrumb href={`/orders/${id}`} back={`Đơn ${shortId(id)}`}>
        {breadcrumb}
      </Breadcrumb>
      <Heading
        eyebrow="THEO DÕI YÊU CẦU"
        title={title}
        description="Chỉ hiển thị bản bạn gửi và kết quả tóm tắt công khai."
      />
    </>
  );
}
