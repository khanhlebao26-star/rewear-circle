import { LoginPage } from "@/features/account/auth/LoginPage";

export default async function LoginRoute({ searchParams }) {
  return <LoginPage query={await searchParams} />;
}
