export type CrossPlayPlatform =
  | "windows"
  | "macos"
  | "linux"
  | "steam"
  | "epic"
  | "gog"
  | "origin"
  | "uplay"
  | "battlenet"
  | "xbox"
  | "playstation"
  | "switch"
  | "ios"
  | "android"
  | "web";

export type CrossPlayIssue =
  "cannot_invite" | "cannot_join" | "desync" | "crash" | "voice_chat" | "other";

export type ReportStatus = "open" | "investigating" | "resolved" | "wontfix";

export interface GameCrossPlay {
  id: string;
  gameId: string;
  platform: CrossPlayPlatform;
  isEnabled: boolean;
  isVerified: boolean;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GameCrossPlayReport {
  id: string;
  gameId: string;
  reporterId: string;
  fromPlatform: CrossPlayPlatform;
  toPlatform: CrossPlayPlatform;
  issue: CrossPlayIssue;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}
