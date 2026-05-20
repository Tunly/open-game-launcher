import { useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import type { PageKey } from "./components/layout/Sidebar";
import { useAuth } from "./hooks/auth-context";
import { AuthPage } from "./pages/AuthPage";
import { CommunityPage } from "./pages/CommunityPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StorePage } from "./pages/StorePage";

const pageMeta: Record<PageKey, { title: string; subtitle: string }> = {
  library: {
    title: "Library",
    subtitle: "Your games, updates, and local installs in one place.",
  },
  store: {
    title: "Store",
    subtitle: "Discover featured releases and add titles to your library.",
  },
  downloads: {
    title: "Downloads",
    subtitle: "Track game installs and updates while they move through the queue.",
  },
  community: {
    title: "Community",
    subtitle: "Player activity, squads, and live launcher network updates.",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage install locations, launcher behavior, and runtime details.",
  },
};

function renderPage(page: PageKey) {
  switch (page) {
    case "store":
      return <StorePage />;
    case "downloads":
      return <DownloadsPage />;
    case "community":
      return <CommunityPage />;
    case "settings":
      return <SettingsPage />;
    case "library":
    default:
      return <LibraryPage />;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("library");
  const { isConfigured, isLoading, signOut, user } = useAuth();
  const meta = pageMeta[activePage];
  const isAuthenticated = Boolean(user);

  return (
    <AppShell
      activePage={activePage}
      authEmail={user?.email ?? null}
      isAuthConfigured={isConfigured}
      isAuthLoading={isLoading}
      isAuthenticated={isAuthenticated}
      subtitle={meta.subtitle}
      title={meta.title}
      onLogout={signOut}
      onNavigate={setActivePage}
    >
      {isLoading ? (
        <div className="neo-copy border-4 border-black bg-[#f5eedf] p-6 text-xs font-bold uppercase shadow-[4px_4px_0_#171411]">
          Session wird geladen...
        </div>
      ) : isConfigured ? (
        isAuthenticated ? renderPage(activePage) : <AuthPage />
      ) : (
        <section className="border-4 border-black bg-[#f5eedf] p-6 shadow-[4px_4px_0_#171411]">
          <h1 className="text-3xl font-black uppercase text-[#171411]">
            Supabase fehlt
          </h1>
          <p className="neo-copy mt-3 text-[10px] font-bold uppercase leading-5 text-[#55504a]">
            Setze VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY in
            launcher/.env.local.
          </p>
        </section>
      )}
    </AppShell>
  );
}
