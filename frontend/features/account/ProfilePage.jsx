"use client";

import Link from "next/link";
import { useSession } from "@/components/layout/AppShell";
import { useMutation } from "@/hooks/useMutation";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Heading } from "@/components/ui/PageNavigation";
import { Icon } from "@/components/ui/Icon";

export function ProfilePage() {
  const session = useSession();
  const mutation = useMutation();
  async function save(event) {
    event.preventDefault();
    const displayName = new FormData(event.currentTarget)
      .get("displayName")
      .trim();
    if (await mutation.run("/me", { displayName }, "PATCH")) {
      await session.refresh();
      mutation.setMessage("Đã lưu tên hiển thị.");
    }
  }
  return (
    <>
      <Heading
        eyebrow="TÀI KHOẢN"
        title="Một chút về bạn."
        description="Quản lý thông tin hiển thị và trạng thái xác minh email."
      />
      <div className="two-col">
        <form className="panel" onSubmit={save}>
          <div className="panel-title">
            <h2>Hồ sơ cá nhân</h2>
            <Icon name="user" />
          </div>
          <Field
            key={session.user.displayName}
            label="Tên hiển thị"
            name="displayName"
            defaultValue={session.user.displayName}
            minLength={2}
            maxLength={100}
            required
          />
          <Field
            label="Email"
            value={session.user.email}
            disabled
            help="Email không thể thay đổi trong phiên bản hiện tại."
          />
          <button className="btn" disabled={mutation.pending}>
            Lưu tên hiển thị
          </button>
          {mutation.error && <ErrorState error={mutation.error} />}
          {mutation.message && <Notice>{mutation.message}</Notice>}
        </form>
        <aside className="panel">
          <p className="eyebrow">TRẠNG THÁI TÀI KHOẢN</p>
          <Badge>
            {session.user.emailVerifiedAt
              ? "Email đã xác minh"
              : "Chưa xác minh email"}
          </Badge>
          <p className="small muted mt">Một tài khoản để mua và bán.</p>
          {!session.user.emailVerifiedAt && (
            <Link href="/verify-email" className="btn secondary full">
              Xác minh ngay
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
