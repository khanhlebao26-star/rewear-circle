"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/layout/AppShell";
import { useMutation } from "@/hooks/useMutation";
import { Empty, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { AuthLayout } from "./AuthLayout";
import { AuthSubmitButton } from "./AuthFormFields";
import { useAuthRedirect, verificationLoginHref } from "./authNavigation";

export function VerifyEmailPage({ query = {} }) {
  const { user } = useSession();
  const mutation = useMutation();
  const redirectAfterAuth = useAuthRedirect();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await mutation.run("/auth/verify-email", { code: form.get("code") });
    if (result) await redirectAfterAuth();
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
    <AuthLayout
      breadcrumb="Xác minh email"
      title="Xác minh email"
      verification
      error={mutation.error}
      message={mutation.message}
    >
      {!user ? (
        <Empty
          title="Đăng nhập để xác minh email."
          href={verificationLoginHref(query.next)}
          action="Đăng nhập"
        />
      ) : user.emailVerifiedAt ? (
        <>
          <Notice>Email của bạn đã xác minh.</Notice>
          <Link className="btn mt" href="/me">
            Về tài khoản
          </Link>
        </>
      ) : (
        <>
          <form onSubmit={submit} className="mt">
            <p className="small muted">
              Mã đã gửi đến <strong>{user.email}</strong>.
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
            <AuthSubmitButton pending={mutation.pending}>Xác minh email</AuthSubmitButton>
          </form>
          <button
            className="link mt"
            disabled={mutation.pending || resendAt > now}
            onClick={resend}
          >
            {resendAt > now
              ? `Gửi lại sau ${Math.ceil((resendAt - now) / 1000)} giây`
              : "Gửi lại mã xác minh"}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
