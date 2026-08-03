import type { PageKey } from "./Sidebar";

const pagePaths: Record<PageKey, string> = {
  activity: "/activity",
  achievements: "/achievements",
  community: "/community",
  downloads: "/downloads",
  family: "/family",
  developer: "/developer",
  friends: "/friends",
  library: "/library",
  news: "/news",
  profile: "/settings/profile",
  settings: "/settings",
  store: "/store",
};

export function getPathForPage(page: PageKey) {
  return pagePaths[page];
}
