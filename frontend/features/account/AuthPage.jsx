"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import { useMutation } from "@/hooks/useMutation";
import { Breadcrumb } from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Icon } from "@/components/ui/Icon";
import { safeNext } from "@/lib/routes.mjs";

export function AuthPage({ type, query = {} }) {
  const suffix =
    typeof query.next === "string"
      ? `?next=${encodeURIComponent(safeNext(query.next))}`
      : "";
  const verificationLogin = `/login?next=${encodeURIComponent("/verify-email" + suffix)}`;
  const session = useSession();
  const mutation = useMutation();
  const router = useRouter();
  const [created, setCreated] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const verify = type === "verify-email",
    register = type === "register";
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (
      values.password &&
      new TextEncoder().encode(values.password).length > 72
    ) {
      mutation.setError(new Error("Mật khẩu tối đa 72 byte UTF-8."));
      return;
    }
    const result = await mutation.run(
      verify
        ? "/auth/verify-email"
        : register
          ? "/auth/register"
          : "/auth/login",
      verify
        ? { code: values.code }
        : register
          ? {
              displayName: values.displayName.trim(),
              email: values.email.trim(),
              password: values.password,
            }
          : { email: values.email.trim(), password: values.password },
    );
    if (!result) return;
    if (register) {
      setCreated(true);
      return;
    }
    const user = await session.refresh();
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(
      safeNext(
        next,
        user?.role === "ADMIN"
          ? "/admin/cases"
          : user?.role === "SUPPORT"
            ? "/support/cases"
            : "/me",
      ),
    );
  }
  async function resend() {
    const result = await mutation.run("/auth/resend-verification");
    if (result) {
      setResendAt(Date.now() + 60000);
      setNow(Date.now());
      mutation.setMessage(result.data.message);
    }
  }
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <Breadcrumb>
        {verify ? "Xác minh email" : register ? "Đăng ký" : "Đăng nhập"}
      </Breadcrumb>
      <section className="auth">
        <div className="auth-visual">
          <p className="eyebrow">REWEAR YOUR STORY</p>
          <h2>
            Một món đồ cũ.
            <br />
            Một câu chuyện mới.
          </h2>
          <p>
            Giữ lại điều còn tốt.
            <br />
            Trao đi điều bạn từng yêu.
          </p>
          <img
            className="auth-art"
            src="/hero-wardrobe.svg"
            alt="Tủ đồ được mặc tiếp"
          />
        </div>
        <div className="auth-form">
          <p className="eyebrow">
            {verify ? "THÊM MỘT BƯỚC NHỎ" : "CHÀO BẠN ĐẾN VỚI REWEAR CIRCLE"}
          </p>
          <h1>
            {verify
              ? "Xác minh email"
              : register
                ? "Bắt đầu vòng tròn mới."
                : "Thật vui khi gặp lại."}
          </h1>
          <p className="intro">
            {verify
              ? "Để tiếp tục mua bán bằng tài khoản của bạn."
              : "Một tài khoản để mua và bán những món đồ còn tốt."}
          </p>
          {mutation.error && <ErrorState error={mutation.error} />}
          {mutation.message && <Notice>{mutation.message}</Notice>}
          {created ? (
            <>
              <Notice>
                Tài khoản đã tạo. Kiểm tra email để nhận mã xác minh.
              </Notice>
              <Link className="btn full mt" href={verificationLogin}>
                Đăng nhập & xác minh email
              </Link>
            </>
          ) : verify && !session.user ? (
            <Empty
              title="Đăng nhập để xác minh email."
              href={verificationLogin}
              action="Đăng nhập"
            />
          ) : verify && session.user.emailVerifiedAt ? (
            <>
              <Notice>Email của bạn đã xác minh.</Notice>
              <Link className="btn mt" href="/me">
                Về tài khoản
              </Link>
            </>
          ) : (
            <>
              <form onSubmit={submit} className="mt">
                {verify ? (
                  <>
                    <p className="small muted">
                      Mã đã gửi đến <strong>{session.user.email}</strong>.
                    </p>
                    <Field
                      label="Mã xác minh gồm 6 chữ số"
                      name="code"
                      className="code-input"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                      autoComplete="one-time-code"
                    />
                  </>
                ) : (
                  <>
                    {register && (
                      <Field
                        label="Tên hiển thị *"
                        name="displayName"
                        minLength={2}
                        maxLength={100}
                        required
                        autoComplete="nickname"
                      />
                    )}
                    <Field
                      label="Email *"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                    />
                    <Field
                      label="Mật khẩu *"
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      help="Ít nhất 12 ký tự, tối đa 72 byte UTF-8."
                    />
                  </>
                )}
                <button className="btn full" disabled={mutation.pending}>
                  {mutation.pending
                    ? "Đang xử lý…"
                    : verify
                      ? "Xác minh email"
                      : register
                        ? "Tạo tài khoản"
                        : "Đăng nhập"}
                  <Icon name="arrow" size={15} />
                </button>
              </form>
              {verify ? (
                <button
                  className="link mt"
                  disabled={mutation.pending || resendAt > now}
                  onClick={resend}
                >
                  {resendAt > now
                    ? `Gửi lại sau ${Math.ceil((resendAt - now) / 1000)} giây`
                    : "Gửi lại mã xác minh"}
                </button>
              ) : (
                <p className="small center mt">
                  {register ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
                  <Link
                    className="link"
                    href={`${register ? "/login" : "/register"}${suffix}`}
                  >
                    {register ? "Đăng nhập" : "Tạo tài khoản"}
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
