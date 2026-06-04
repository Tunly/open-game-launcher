export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  authorId: string;
  gameId: string | null;
  tags: string[];
  coverImageUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
