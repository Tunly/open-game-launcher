import type { FriendLink, PlatformType } from "./types/friends";
import type { Friendship } from "./types/profile";

export type PlatformFriendGroup = {
  avatarUrl: string | null;
  displayName: string;
  key: string;
  links: FriendLink[];
};

export function getUnifiedFriendCount(
  currentUserId: string,
  friends: Friendship[],
  friendLinks: FriendLink[],
) {
  return (
    friends.length + buildPlatformRoster(currentUserId, friends, friendLinks).externalGroups.length
  );
}

export function buildPlatformRoster(
  currentUserId: string,
  friends: Friendship[],
  friendLinks: FriendLink[],
) {
  const friendIds = new Set(
    friends.map((friendship) =>
      friendship.requesterId === currentUserId ? friendship.addresseeId : friendship.requesterId,
    ),
  );
  const activeLinks = friendLinks.filter((link) => !link.dismissed);
  const matchedUserByMergeGroup = new Map<string, string>();

  for (const link of activeLinks) {
    if (link.mergeGroupId && link.matchedUserId && friendIds.has(link.matchedUserId)) {
      matchedUserByMergeGroup.set(link.mergeGroupId, link.matchedUserId);
    }
  }

  const platformsByUserId = new Map<string, PlatformType[]>();
  const externalByKey = new Map<string, FriendLink[]>();

  for (const link of activeLinks) {
    const matchedFriendId =
      link.matchedUserId && friendIds.has(link.matchedUserId)
        ? link.matchedUserId
        : link.mergeGroupId
          ? matchedUserByMergeGroup.get(link.mergeGroupId)
          : undefined;

    if (matchedFriendId) {
      const platforms = platformsByUserId.get(matchedFriendId) ?? [];
      if (!platforms.includes(link.platform)) platforms.push(link.platform);
      platformsByUserId.set(matchedFriendId, platforms);
      continue;
    }

    const groupKey = link.matchedUserId
      ? `matched:${link.matchedUserId}`
      : link.mergeGroupId
        ? `merge:${link.mergeGroupId}`
        : `link:${link.id}`;
    const group = externalByKey.get(groupKey) ?? [];
    group.push(link);
    externalByKey.set(groupKey, group);
  }

  const externalGroups: PlatformFriendGroup[] = Array.from(externalByKey, ([key, links]) => ({
    avatarUrl: links.find((link) => link.platformFriendAvatar)?.platformFriendAvatar ?? null,
    displayName:
      links.find((link) => link.platformFriendName)?.platformFriendName ??
      links[0]?.platformFriendId ??
      "Unknown platform friend",
    key,
    links,
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { externalGroups, platformsByUserId };
}
