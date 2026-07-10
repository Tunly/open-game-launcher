export interface OverlaySettings {
  id: string;
  userId: string;
  isEnabled: boolean;
  hotkey: string;
  position: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  opacity: number;
  fpsHudEnabled: boolean;
  showGpu: boolean;
  shortcuts: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface NativeOverlaySettings {
  isEnabled?: boolean;
  hotkey?: string;
  position?: OverlaySettings["position"];
  opacity?: number;
  fpsHudEnabled?: boolean;
  showGpu?: boolean;
}

export interface AchievementPopupPayload {
  gameTitle: string;
  achievementName: string;
  description: string;
  rarity: string;
  iconUrl: string | null;
}
