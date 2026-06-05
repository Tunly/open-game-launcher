import type { PageKey } from "./Sidebar";

const pagePaths: Record<PageKey, string> = {
  achievements: "/achievements",
  community: "/community",
  controllers: "/controllers",
  downloads: "/downloads",
  family: "/family",
  developer: "/developer",
  friends: "/friends",
  home: "/home",
  library: "/library",
  mods: "/mods",
  news: "/news",
  profile: "/settings/profile",
  settings: "/settings",
  store: "/store",
};

export function getPathForPage(page: PageKey) {
  return pagePaths[page];
}
