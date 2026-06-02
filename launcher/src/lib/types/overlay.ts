export interface OverlaySettings {
  id: string; userId: string; isEnabled: boolean; hotkey: string;
  position: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  opacity: number; shortcuts: Record<string, string>; createdAt: string; updatedAt: string;
}
