import { RegisterPage } from "@/features/account/auth/RegisterPage";

export default async function RegisterRoute({ searchParams }) {
  return <RegisterPage query={await searchParams} />;
}
