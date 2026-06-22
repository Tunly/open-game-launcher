export interface Screenshot {
  id: string;
  userId: string;
  gameId: string | null;
  storagePath: string;
  thumbnailPath: string | null;
  publicUrl?: string | null;
  thumbnailUrl?: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;
}

export type ScreenshotActionFailureReason = "config" | "auth" | "storage" | "database" | "schema";

export interface ScreenshotActionFailure {
  ok: false;
  reason: ScreenshotActionFailureReason;
  message: string;
}

export interface ScreenshotLikeState {
  count: number;
  likedByMe: boolean;
}
