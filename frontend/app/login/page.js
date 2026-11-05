import { AuthPage } from "@/features/account/AuthPage";

export default async function LoginRoute({ searchParams }) {
  return <AuthPage type="login" query={await searchParams} />;
}
