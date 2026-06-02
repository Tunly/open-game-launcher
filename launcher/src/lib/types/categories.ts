export interface Category { id: string; name: string; slug: string; icon: string | null; parentId: string | null; sortOrder: number; createdAt: string; }
export interface Tag { id: string; name: string; slug: string; createdAt: string; }
export interface GameCategory { gameId: string; categoryId: string; }
export interface GameTag { gameId: string; tagId: string; }
