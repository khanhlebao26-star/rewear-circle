"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./AppShell";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { Empty, Loading, Notice } from "@/components/ui/Feedback";

export default function WorkspaceAccess({
  children,
  role = "USER",
  verifyEmail = false,
  plain = false,
}) {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const next = encodeURIComponent(pathname);
  let content = children;

  if (loading) {
    content = <Loading />;
  } else if (!user) {
    content = (
      <Empty
        title="Đăng nhập để tiếp tục."
        href={`/login?next=${next}`}
        action="Đăng nhập"
        icon="user"
      >
        Khám phá, tìm kiếm và xem chi tiết món đồ vẫn mở cho khách.
      </Empty>
    );
  } else if (role && user.role !== role) {
    content = (
      <Empty
        title="Màn hình không thuộc quyền truy cập của bạn."
        href="/"
        action="Về trang chủ"
        icon="shield"
      />
    );
  } else if (verifyEmail && !user.emailVerifiedAt) {
    content = (
      <>
        <Notice tone="amber">
          Xác minh email trước khi mua hàng, đăng bán hoặc gửi báo cáo.
        </Notice>
        <Link className="btn mt" href={`/verify-email?next=${next}`}>
          Xác minh email
        </Link>
      </>
    );
  }

  if (plain) {
    return (
      <main
        key={pathname}
        id="main-content"
        className="shell page"
        tabIndex={-1}
      >
        {content}
      </main>
    );
  }

  return (
    <WorkspaceLayout
      key={pathname}
      staff={role === "ADMIN" || role === "SUPPORT"}
      support={role === "SUPPORT"}
    >
      {content}
    </WorkspaceLayout>
  );
}
