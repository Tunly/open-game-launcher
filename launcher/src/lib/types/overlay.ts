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

export interface ScreenshotMeta {
  id: string;
  file_name: string;
  path: string;
  base64_preview: string | null;
  created_at: string;
  width: number;
  height: number;
  size_bytes: number;
}

export interface AchievementPopupPayload {
  game_title: string;
  achievement_name: string;
  description: string;
  rarity: string;
  icon_url: string | null;
}
