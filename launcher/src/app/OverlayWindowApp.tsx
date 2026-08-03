import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { OverlayPage } from "../pages/OverlayPage";
import { AuthProvider } from "./providers/AuthProvider";

export function OverlayWindowApp() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <OverlayPage />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
