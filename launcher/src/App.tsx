import { useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import type { PageKey } from "./components/layout/Sidebar";
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
  const meta = pageMeta[activePage];

  return (
    <AppShell
      activePage={activePage}
      subtitle={meta.subtitle}
      title={meta.title}
      onNavigate={setActivePage}
    >
      {renderPage(activePage)}
    </AppShell>
  );
}
