/**
 * auth.tsx — Authentication context and provider for the entire client application.
 *
 * How it works:
 *   1. On mount, <AuthProvider> calls GET /api/auth/me to check if the browser
 *      has a valid session cookie. If it does, the server returns the User object;
 *      if not, it returns 401 and the user is treated as unauthenticated.
 *   2. The provider exposes `login(email, password)` and `logout()` mutations
 *      that POST to /api/auth/login and /api/auth/logout respectively. On success
 *      they invalidate the "auth/me" query so the user state refreshes instantly.
 *
 * Roles and access levels:
 *   • "super_admin" — protected admin account; cannot be edited or deleted
 *   • "admin"       — full platform access, can manage users, companies, and all settings
 *   • "user"        — general access; can edit properties, run scenarios, view reports
 *
 * The auth state is cached for 5 minutes (staleTime) to avoid redundant network
 * calls on every page navigation.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserRole, isAdminRole } from "@shared/constants";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { apiRequest, safeReadJson } from "@/lib/queryClient";

interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  company: string | null;
  title: string | null;
  role: string;
  hideTourPrompt: boolean;
  canManageScenarios: boolean;
  rebeccaOptOut: boolean;
  rebeccaRailOpen: boolean;
  colorMode: string | null;
  bgAnimation: string | null;
  fontPreference: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isUser: boolean;
  canManageScenarios: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestLogout: () => void;
  logoutPending: boolean;
  confirmLogout: () => Promise<void>;
  cancelLogout: () => void;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch: refetchQuery } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch user");
      }
      const body = await safeReadJson<{ user?: User }>(res);
      return body?.user ?? null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      // `apiRequest` throws an `ApiError` whose `message` is already a clean
      // human-readable string built from the server's `error` field or a
      // `"Login failed (HTTP …)"` style fallback for empty / HTML responses.
      const res = await apiRequest("POST", "/api/auth/login", { email, password }, {
        fallbackMessage: "Login failed",
      });
      return (await safeReadJson(res)) ?? {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      (window.top || window).location.replace("/login");
    },
  });

  const [logoutPending, setLogoutPending] = useState(false);

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const requestLogout = useCallback(() => {
    const { isDirty } = useScenarioDirtyState.getState();
    if (isDirty) {
      setLogoutPending(true);
    } else {
      logoutMutation.mutate();
    }
  }, []);

  const confirmLogout = useCallback(async () => {
    setLogoutPending(false);
    await logoutMutation.mutateAsync();
  }, []);

  const cancelLogout = useCallback(() => {
    setLogoutPending(false);
  }, []);

  const user = data ?? null;
  const isAdmin = user ? isAdminRole(user.role) : false;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isUser = user?.role === UserRole.USER;
  const canManageScenarios = !!user && (user.canManageScenarios ?? true);
  
  const refetch = () => {
    refetchQuery();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, isSuperAdmin, isUser, canManageScenarios, login, logout, requestLogout, logoutPending, confirmLogout, cancelLogout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
