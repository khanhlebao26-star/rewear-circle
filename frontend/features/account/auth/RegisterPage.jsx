"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@/hooks/useMutation";
import { Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { AuthLayout } from "./AuthLayout";
import {
  AuthCredentialsFields,
  AuthSubmitButton,
  validatePassword,
} from "./AuthFormFields";
import { authNextSuffix, verificationLoginHref } from "./authNavigation";

export function RegisterPage({ query = {} }) {
  const mutation = useMutation();
  const [created, setCreated] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const { displayName, email, password } = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (!validatePassword(password, mutation.setError)) return;
    const result = await mutation.run("/auth/register", {
      displayName: displayName.trim(),
      email: email.trim(),
      password,
    });
    if (result) setCreated(true);
  }

  return (
    <AuthLayout
      breadcrumb="Đăng ký"
      title="Bắt đầu vòng tròn mới."
      error={mutation.error}
      message={mutation.message}
    >
      {created ? (
        <>
          <Notice>
            Tài khoản đã tạo. Kiểm tra email để nhận mã xác minh.
          </Notice>
          <Link className="btn full mt" href={verificationLoginHref(query.next)}>
            Đăng nhập & xác minh email
          </Link>
        </>
      ) : (
        <>
          <form onSubmit={submit} className="mt">
            <Field
              label="Tên hiển thị *"
              name="displayName"
              minLength={2}
              maxLength={100}
              required
              autoComplete="nickname"
            />
            <AuthCredentialsFields passwordAutoComplete="new-password" />
            <AuthSubmitButton pending={mutation.pending}>Tạo tài khoản</AuthSubmitButton>
          </form>
          <p className="small center mt">
            Đã có tài khoản?{" "}
            <Link className="link" href={`/login${authNextSuffix(query.next)}`}>
              Đăng nhập
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
