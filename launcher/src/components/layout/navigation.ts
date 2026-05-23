import type { PageKey } from "./Sidebar";

const pagePaths: Record<PageKey, string> = {
  community: "/community",
  downloads: "/downloads",
  friends: "/friends",
  home: "/home",
  library: "/library",
  profile: "/settings/profile",
  settings: "/settings",
  store: "/store",
};

export function getPathForPage(page: PageKey) {
  return pagePaths[page];
}
