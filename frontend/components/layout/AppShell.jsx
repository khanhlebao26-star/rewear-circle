"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api.mjs";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";

const Session = createContext(null);
const refreshInterval = 60_000;
export const useSession = () => useContext(Session);
export default function AppShell({ children }) {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const currentUser = useRef(null);
  const lastRefresh = useRef(0);
  const requests = useRef({ session: 0, cart: 0, notifications: 0 });

  const syncCartCount = useCallback((count) => {
    requests.current.cart++;
    setCartCount(count);
  }, []);
  const syncUnread = useCallback((count) => {
    requests.current.notifications++;
    setUnread(count);
  }, []);
  const applyUser = useCallback((next) => {
    if (currentUser.current?.id !== next?.id || currentUser.current?.role !== next?.role) {
      syncCartCount(0);
      syncUnread(0);
    }
    currentUser.current = next;
    setUser(next);
  }, [syncCartCount, syncUnread]);

  const refreshCounter = useCallback(async (counter, path, apply) => {
    const version = ++requests.current[counter];
    try {
      const result = await api(path);
      if (version === requests.current[counter]) apply(result);
    } catch {
      // A failed badge request can be retried on focus or after the next action.
    }
  }, []);
  const refreshCart = useCallback(() => {
    if (currentUser.current?.role !== "USER") return;
    return refreshCounter("cart", "/cart", ({ data }) => setCartCount(data?.items?.length || 0));
  }, [refreshCounter]);
  const refreshNotifications = useCallback(() => {
    if (!currentUser.current) return;
    return refreshCounter("notifications", "/me/notifications?limit=1", ({ meta }) => setUnread(meta?.unread || 0));
  }, [refreshCounter]);

  const refresh = useCallback(async () => {
    const version = ++requests.current.session;
    lastRefresh.current = Date.now();
    try {
      const { data } = await api("/me");
      if (version !== requests.current.session) return null;
      applyUser(data);
      setLoading(false);
      await Promise.all([refreshCart(), refreshNotifications()]);
      return version === requests.current.session ? data : null;
    } catch (error) {
      if (version === requests.current.session && error.status === 401) applyUser(null);
      return null;
    } finally {
      if (version === requests.current.session) setLoading(false);
    }
  }, [applyUser, refreshCart, refreshNotifications]);

  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastRefresh.current >= refreshInterval) void refresh();
  }, [refresh]);
  useEffect(() => {
    refreshIfStale();
  }, [pathname, refreshIfStale]);
  useEffect(() => {
    window.addEventListener("focus", refreshIfStale);
    return () => window.removeEventListener("focus", refreshIfStale);
  }, [refreshIfStale]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    requests.current.session++;
    applyUser(null);
    window.location.assign("/");
  };
  const staff =
    pathname.startsWith("/admin") || pathname.startsWith("/support");
  return (
    <Session.Provider value={{ user, loading, refresh, logout, refreshCart, refreshNotifications, syncCartCount, syncUnread }}>
      {!staff && (
        <SiteHeader
          user={user}
          cartCount={cartCount}
          unreadCount={unread}
          onLogout={logout}
        />
      )}
      {children}
      {!staff && <SiteFooter />}
    </Session.Provider>
  );
}
