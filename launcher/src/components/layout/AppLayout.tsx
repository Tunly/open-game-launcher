import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useCurrentUser } from "../../hooks/useCurrentUser";
import { AppShell } from "./AppShell";
import type { PageKey } from "./Sidebar";
import { getPathForPage } from "./navigation";

function getActivePage(pathname: string): PageKey {
  if (pathname.startsWith("/store")) return "store";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/community")) return "community";
  if (pathname.startsWith("/downloads")) return "downloads";
  if (pathname.startsWith("/friends")) return "friends";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/u/")) return "profile";
  return "home";
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConfigured, isLoading, signOut, user } = useCurrentUser();
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    typeof metadata?.display_name === "string"
      ? metadata.display_name
      : typeof metadata?.full_name === "string"
        ? metadata.full_name
        : null;
  const avatarUrl =
    typeof metadata?.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata?.picture === "string"
        ? metadata.picture
        : null;

  return (
    <AppShell
      activePage={getActivePage(location.pathname)}
      authAvatarUrl={avatarUrl}
      authDisplayName={displayName}
      authEmail={user?.email ?? null}
      isAuthConfigured={isConfigured}
      isAuthLoading={isLoading}
      isAuthenticated={Boolean(user)}
      subtitle=""
      title=""
      onLogout={signOut}
      onNavigate={(page) => navigate(getPathForPage(page))}
      onRoute={(path) => navigate(path)}
    >
        <Outlet />
    </AppShell>
  );
}
