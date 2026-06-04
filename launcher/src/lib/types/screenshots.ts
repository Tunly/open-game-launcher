export interface Screenshot {
  id: string;
  userId: string;
  gameId: string | null;
  storagePath: string;
  thumbnailPath: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;
}
