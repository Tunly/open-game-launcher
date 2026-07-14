export type WindowView = "main" | "overlay" | "fps-hud";

export function shouldMountLauncherUpdateHost(view: WindowView) {
  return view === "main";
}
