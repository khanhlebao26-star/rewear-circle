import { VerifyEmailPage } from "@/features/account/auth/VerifyEmailPage";

export default async function VerifyEmailRoute({ searchParams }) {
  return <VerifyEmailPage query={await searchParams} />;
}
