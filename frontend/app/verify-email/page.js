import { AuthPage } from "@/features/account/AuthPage";

export default async function VerifyEmailRoute({ searchParams }) {
  return <AuthPage type="verify-email" query={await searchParams} />;
}
