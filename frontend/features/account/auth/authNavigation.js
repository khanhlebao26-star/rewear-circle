import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import { safeNext } from "@/lib/routes.mjs";

export function authNextSuffix(next) {
  return typeof next === "string"
    ? `?next=${encodeURIComponent(safeNext(next))}`
    : "";
}

export function verificationLoginHref(next) {
  return `/login?next=${encodeURIComponent("/verify-email" + authNextSuffix(next))}`;
}

export function useAuthRedirect() {
  const { refresh } = useSession();
  const router = useRouter();
  return async function redirectAfterAuth() {
    const user = await refresh();
    const next = new URLSearchParams(window.location.search).get("next");
    const fallback =
      user?.role === "ADMIN"
        ? "/admin/cases"
        : user?.role === "SUPPORT"
          ? "/support/cases"
          : "/me";
    router.push(safeNext(next, fallback));
  };
}
