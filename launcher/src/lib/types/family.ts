export type FamilyRole = "owner" | "member";

export interface FamilyGroup {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string;
  maxMembers: number;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  role: FamilyRole;
  joinedAt: string;
}

export interface FamilySharedGame {
  id: string;
  familyId: string;
  gameId: string;
  sharedByUserId: string;
  isAvailable: boolean;
  currentUserId: string | null;
  sharedAt: string;
}
