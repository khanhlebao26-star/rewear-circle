"use client";

import Link from "next/link";
import { useMutation } from "@/hooks/useMutation";
import { AuthLayout } from "./AuthLayout";
import {
  AuthCredentialsFields,
  AuthSubmitButton,
  validatePassword,
} from "./AuthFormFields";
import { authNextSuffix, useAuthRedirect } from "./authNavigation";

export function LoginPage({ query = {} }) {
  const mutation = useMutation();
  const redirectAfterAuth = useAuthRedirect();

  async function submit(event) {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(event.currentTarget));
    if (!validatePassword(password, mutation.setError)) return;
    const result = await mutation.run("/auth/login", {
      email: email.trim(),
      password,
    });
    if (result) await redirectAfterAuth();
  }

  return (
    <AuthLayout
      breadcrumb="Đăng nhập"
      title="Thật vui khi gặp lại."
      error={mutation.error}
      message={mutation.message}
    >
      <form onSubmit={submit} className="mt">
        <AuthCredentialsFields passwordAutoComplete="current-password" />
        <AuthSubmitButton pending={mutation.pending}>Đăng nhập</AuthSubmitButton>
      </form>
      <p className="small center mt">
        Chưa có tài khoản?{" "}
        <Link className="link" href={`/register${authNextSuffix(query.next)}`}>
          Tạo tài khoản
        </Link>
      </p>
    </AuthLayout>
  );
}
