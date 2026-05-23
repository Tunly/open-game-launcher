import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";
import { AuthPage } from "../pages/AuthPage";
import { CommunityPage } from "../pages/CommunityPage";
import { DownloadsPage } from "../pages/DownloadsPage";
import { EditProfilePage } from "../pages/EditProfilePage";
import { FriendsPage } from "../pages/FriendsPage";
import { HomePage } from "../pages/HomePage";
import { LibraryPage } from "../pages/LibraryPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PrivacySettingsPage } from "../pages/PrivacySettingsPage";
import { ProfileCustomizePage } from "../pages/ProfileCustomizePage";
import { ProfilePage } from "../pages/ProfilePage";
import { StorePage } from "../pages/StorePage";
import { SettingsPage } from "../pages/SettingsPage";

// Browser history is correct for the web preview. If a future Tauri build needs
// simple deep-link handling without a web server, switch this to a HashRouter.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <StorePage /> },
      { path: "/home", element: <HomePage /> },
      { path: "/library", element: <LibraryPage /> },
      { path: "/store", element: <StorePage /> },
      { path: "/community", element: <CommunityPage /> },
      { path: "/downloads", element: <DownloadsPage /> },
      { path: "/auth", element: <AuthPage /> },
      { path: "/u/:username", element: <ProfilePage /> },
      { path: "/settings/profile", element: <EditProfilePage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/settings/profile/customize", element: <ProfileCustomizePage /> },
      { path: "/settings/privacy", element: <PrivacySettingsPage /> },
      { path: "/friends", element: <FriendsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
