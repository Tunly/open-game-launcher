import { RouterProvider, useNavigate } from "react-router-dom";
import { AuthProvider } from "./providers/AuthProvider";
import { router } from "./router";
import { useDeepLink } from "../hooks/useDeepLink";

function DeepLinkHandler() {
  const navigate = useNavigate();
  useDeepLink((link) => {
    const { action, params } = link;
    const game = params.game || params.title || "";
    const platform = params.platform || "";
    const invite = params.invite || "";

    switch (action) {
      case "join":
        navigate(`/library?join=${game}&platform=${platform}&invite=${invite}`);
        break;
      case "open":
        if (game) navigate(`/store?slug=${game}`);
        break;
      case "install":
        if (game) navigate(`/store?slug=${game}&install=1`);
        break;
      default:
        console.warn("[deep-link] Unknown action:", action);
    }
  });
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <DeepLinkHandler />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
