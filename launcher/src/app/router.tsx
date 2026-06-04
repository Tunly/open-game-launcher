import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";

import { AppLayout } from "../components/layout/AppLayout";
import { RouteErrorBoundary } from "../components/ui/AppErrorBoundary";

const AuthPage = lazy(() =>
  import("../pages/AuthPage").then((page) => ({ default: page.AuthPage })),
);
const CommunityPage = lazy(() =>
  import("../pages/CommunityPage").then((page) => ({ default: page.CommunityPage })),
);
const DownloadsPage = lazy(() =>
  import("../pages/DownloadsPage").then((page) => ({ default: page.DownloadsPage })),
);
const EditProfilePage = lazy(() =>
  import("../pages/EditProfilePage").then((page) => ({ default: page.EditProfilePage })),
);
const FriendsPage = lazy(() =>
  import("../pages/FriendsPage").then((page) => ({ default: page.FriendsPage })),
);
const HomePage = lazy(() =>
  import("../pages/HomePage").then((page) => ({ default: page.HomePage })),
);
const LibraryPage = lazy(() =>
  import("../pages/LibraryPage").then((page) => ({ default: page.LibraryPage })),
);
const ModsPage = lazy(() =>
  import("../pages/ModsPage").then((page) => ({ default: page.ModsPage })),
);
const NotFoundPage = lazy(() =>
  import("../pages/NotFoundPage").then((page) => ({ default: page.NotFoundPage })),
);
const PrivacySettingsPage = lazy(() =>
  import("../pages/PrivacySettingsPage").then((page) => ({ default: page.PrivacySettingsPage })),
);
const ProfileCustomizePage = lazy(() =>
  import("../pages/ProfileCustomizePage").then((page) => ({ default: page.ProfileCustomizePage })),
);
const ProfilePage = lazy(() =>
  import("../pages/ProfilePage").then((page) => ({ default: page.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import("../pages/SettingsPage").then((page) => ({ default: page.SettingsPage })),
);

const FamilyPage = lazy(() =>
  import("../pages/FamilyPage").then((page) => ({ default: page.FamilyPage })),
);
const DeveloperPortalPage = lazy(() =>
  import("../pages/DeveloperPortalPage").then((page) => ({ default: page.DeveloperPortalPage })),
);
const NewsPage = lazy(() =>
  import("../pages/NewsPage").then((page) => ({ default: page.NewsPage })),
);
const StorePage = lazy(() =>
  import("../pages/StorePage").then((page) => ({ default: page.StorePage })),
);
const AchievementsPage = lazy(() =>
  import("../pages/AchievementsPage").then((page) => ({ default: page.AchievementsPage })),
);
const FpsHudPage = lazy(() =>
  import("../pages/FpsHudPage").then((page) => ({ default: page.FpsHudPage })),
);
const OverlayPage = lazy(() =>
  import("../pages/OverlayPage").then((page) => ({ default: page.OverlayPage })),
);

function page(element: ReactNode) {
  return (
    <Suspense
      fallback={
        <section className="grid h-full place-items-center bg-[#fbf4e7] text-[#171411]">
          <div className="border-4 border-black bg-[#f4ead8] px-5 py-3 text-[14px] font-black uppercase shadow-[6px_6px_0_#171411]">
            Loading
          </div>
        </section>
      }
    >
      {element}
    </Suspense>
  );
}

// Browser history is correct for the web preview. If a future Tauri build needs
// simple deep-link handling without a web server, switch this to a HashRouter.
export const router = createBrowserRouter([
  { path: "/fps-hud", element: page(<FpsHudPage />), errorElement: <RouteErrorBoundary /> },
  {
    path: "/overlay",
    element: page(<OverlayPage />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/", element: <Navigate to="/library" replace /> },
      { path: "/home", element: page(<HomePage />) },
      { path: "/library", element: page(<LibraryPage />) },
      { path: "/store", element: page(<StorePage />) },
      { path: "/community", element: page(<CommunityPage />) },
      { path: "/downloads", element: page(<DownloadsPage />) },
      { path: "/achievements", element: page(<AchievementsPage />) },
      { path: "/mods", element: page(<ModsPage />) },
      { path: "/auth", element: page(<AuthPage />) },
      { path: "/u/:username", element: page(<ProfilePage />) },
      { path: "/settings/profile", element: page(<EditProfilePage />) },
      { path: "/settings", element: page(<SettingsPage />) },
      { path: "/settings/profile/customize", element: page(<ProfileCustomizePage />) },
      { path: "/settings/privacy", element: page(<PrivacySettingsPage />) },
      { path: "/friends", element: page(<FriendsPage />) },
      { path: "/family", element: page(<FamilyPage />) },
      { path: "/developer", element: page(<DeveloperPortalPage />) },
      { path: "/news", element: page(<NewsPage />) },
      { path: "*", element: page(<NotFoundPage />) },
    ],
  },
]);
