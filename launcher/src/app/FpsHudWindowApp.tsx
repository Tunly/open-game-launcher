import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { FpsHudPage } from "../pages/FpsHudPage";

export function FpsHudWindowApp() {
  return (
    <AppErrorBoundary>
      <FpsHudPage />
    </AppErrorBoundary>
  );
}
