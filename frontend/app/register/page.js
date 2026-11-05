import { AuthPage } from "@/features/account/AuthPage";

export default async function RegisterRoute({ searchParams }) {
  return <AuthPage type="register" query={await searchParams} />;
}
