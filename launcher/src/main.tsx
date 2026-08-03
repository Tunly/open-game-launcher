import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { resolveWindowView, syncWindowRuntimeClass } from "./app/window-bootstrap";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

const view = await resolveWindowView();
syncWindowRuntimeClass(view);

const WindowApp = await (async () => {
  switch (view) {
    case "overlay":
      return (await import("./app/OverlayWindowApp")).OverlayWindowApp;
    case "fps-hud":
      return (await import("./app/FpsHudWindowApp")).FpsHudWindowApp;
    case "main":
    default:
      return (await import("./app/App")).default;
  }
})();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WindowApp />
  </React.StrictMode>,
);
