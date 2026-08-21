import { normalizeLauncherKey } from "./formatters";
import type { Game } from "./types";

/**
 * Catalog-entry hygiene: rules that decide whether a library entry is a real
 * game or marketplace noise (Unreal Engine assets, Ubisoft DLC placeholders).
 * Kept separate from filter-state so the keyword lists stay reachable by
 * gamepass/epic/ubisoft tests without spinning up the filter pipeline.
 */

export function isUnrealEngineAssetEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">,
): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "epic") {
    return false;
  }

  const text = `${game.id} ${game.title} ${game.description}`.toLowerCase();
  const titleLower = game.title.toLowerCase();
  const unrealMarker =
    text.includes("unreal engine") ||
    text.includes("unrealengine") ||
    text.includes("unreal marketplace") ||
    text.includes("ue marketplace") ||
    text.includes("marketplaceassets") ||
    text.includes("marketplace assets") ||
    text.includes("fab.com") ||
    text.includes('"fab"') ||
    text.includes('"ue"') ||
    text.includes("uefn") ||
    text.includes("ue-") ||
    /\bue[45]?\b/.test(text);
  const assetMarker =
    text.includes("asset") ||
    text.includes("vault") ||
    text.includes("plugin") ||
    text.includes("plugins") ||
    text.includes("template") ||
    text.includes("sample project") ||
    text.includes("sample") ||
    text.includes("environment") ||
    text.includes("environments") ||
    text.includes("material") ||
    text.includes("materials") ||
    text.includes("blueprint") ||
    text.includes("blueprints") ||
    text.includes("mesh") ||
    text.includes("meshes") ||
    text.includes("animation pack") ||
    text.includes("animation") ||
    text.includes("animations") ||
    text.includes("vfx") ||
    text.includes("sfx") ||
    text.includes("sound effects") ||
    text.includes("music pack") ||
    text.includes("texture") ||
    text.includes("textures") ||
    text.includes("props") ||
    text.includes("characters") ||
    text.includes("3d model") ||
    text.includes("kitbash") ||
    text.includes("props pack") ||
    text.includes("modular") ||
    text.includes("low poly") ||
    text.includes("stylized");

  if (game.id.startsWith("epic-owned-")) {
    const titleAssetMarker =
      titleLower.includes("asset") ||
      titleLower.includes("plugin") ||
      titleLower.includes("template") ||
      titleLower.includes("megascans") ||
      titleLower.includes("quixel") ||
      titleLower.includes("material") ||
      titleLower.includes("mesh") ||
      titleLower.includes("blueprint") ||
      titleLower.includes("texture") ||
      titleLower.includes("environment") ||
      titleLower.includes("modular") ||
      titleLower.includes("props") ||
      titleLower.includes("vfx") ||
      titleLower.includes("sfx") ||
      titleLower.includes("animation pack") ||
      titleLower.includes("stylized") ||
      titleLower.includes("low poly") ||
      titleLower.includes("kitbash") ||
      titleLower.includes("3d model");
    return unrealMarker || assetMarker || titleAssetMarker;
  }

  return unrealMarker && assetMarker;
}

export function isUbisoftDlcEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher">,
): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "ubisoft") {
    return false;
  }

  const titleLower = game.title.toLowerCase();
  const text = `${game.title} ${game.description}`.toLowerCase();

  if (
    titleLower.includes("benchmark") ||
    titleLower.includes("pts") ||
    titleLower.includes("language pack") ||
    titleLower.includes("texture pack") ||
    titleLower.includes("ultra hd") ||
    titleLower.includes("hd texture") ||
    titleLower.includes("high-rez")
  ) {
    return true;
  }

  const hasDlcKeyword =
    /\bdlc\b/.test(text) ||
    text.includes("add-on") ||
    text.includes("addon") ||
    text.includes("season pass") ||
    text.includes("battle pass") ||
    text.includes("expansion") ||
    text.includes("pack") ||
    text.includes("paket") ||
    text.includes("pass") ||
    text.includes("bonus") ||
    text.includes("upgrade") ||
    text.includes("credit") ||
    text.includes("coin") ||
    text.includes("currency") ||
    text.includes("helix") ||
    text.includes("year") ||
    text.includes("episode ") ||
    text.includes("bundle") ||
    text.includes("unlock") ||
    text.includes("skin") ||
    text.includes("outfit") ||
    text.includes("costume") ||
    text.includes("weapon") ||
    text.includes("cosmetic") ||
    text.includes("gear set") ||
    text.includes("knuckles") ||
    text.includes("gauntlet") ||
    text.includes("belt") ||
    text.includes("breeches") ||
    text.includes("cloak") ||
    text.includes("revolver") ||
    text.includes("pistol") ||
    text.includes("rifle") ||
    text.includes("kukri") ||
    text.includes("rapier") ||
    text.includes("sword") ||
    text.includes("cane-sword") ||
    text.includes("spear") ||
    text.includes("axe") ||
    text.includes("blade") ||
    text.includes("sails") ||
    text.includes("hood") ||
    text.includes("trousers") ||
    text.includes("waistcoat") ||
    text.includes("bracers") ||
    text.includes("bushido") ||
    text.includes("artbook") ||
    text.includes("art book") ||
    text.includes("soundtrack") ||
    text.includes("digital art") ||
    text.includes("ornament") ||
    text.includes("figurehead") ||
    text.includes("pre-order") ||
    text.includes("preorder") ||
    text.includes("promo") ||
    text.includes("giveaway") ||
    text.includes("xp boost") ||
    text.includes("loot") ||
    text.includes("ubicollectibles") ||
    text.includes("hero skin") ||
    text.includes("premier") ||
    text.includes("welcome") ||
    text.includes("signature") ||
    text.includes("initiates") ||
    text.includes("impaler") ||
    text.includes("sabre") ||
    text.includes("honour") ||
    text.includes("season ");

  if (hasDlcKeyword) {
    return true;
  }

  const dashIdx = titleLower.indexOf(" - ");
  if (dashIdx !== -1) {
    const suffix = titleLower.slice(dashIdx + 3);
    if (
      suffix.includes("hero") ||
      suffix.includes("operator") ||
      suffix.includes("character") ||
      suffix.includes("quest") ||
      suffix.includes("mission") ||
      suffix.includes("dead kings") ||
      suffix.includes("secrets of") ||
      suffix.includes("legacy of") ||
      suffix.includes("warlords of") ||
      suffix.includes("wrath of") ||
      suffix.includes("fate of") ||
      suffix.includes("tyranny of") ||
      suffix.includes("siege of") ||
      suffix.includes("underground") ||
      suffix.includes("freedom cry") ||
      suffix.includes("last stand") ||
      suffix.includes("human conditions") ||
      suffix.includes("no compromise") ||
      suffix.includes("bad blood") ||
      suffix.includes("road to") ||
      suffix.includes("conspiracy") ||
      suffix.includes("jack the ripper") ||
      suffix.includes("lost archive") ||
      suffix.includes("calling all units") ||
      suffix.includes("wild run") ||
      suffix.includes("narco road") ||
      suffix.includes("fallen ghosts") ||
      suffix.includes("rocket wings") ||
      suffix.includes("winter fest") ||
      suffix.includes("x games") ||
      suffix.includes("crash &") ||
      suffix.includes("void dasher") ||
      suffix.includes("dedsec") ||
      suffix.includes("curse of") ||
      suffix.includes("guild of") ||
      suffix.includes("pride of") ||
      suffix.includes("trove of") ||
      suffix.includes("streets of") ||
      suffix.includes("runaway") ||
      suffix.includes("naval") ||
      suffix.includes("calamity") ||
      suffix.includes("hidden ones") ||
      suffix.includes("killed by") ||
      suffix.includes("chemical") ||
      suffix.includes("nighthawk") ||
      suffix.includes("suave") ||
      suffix.startsWith("the ") ||
      suffix.includes("animus") ||
      suffix.includes("company logos") ||
      suffix.includes("road 66")
    ) {
      return true;
    }
  }

  return false;
}

export function shouldHideNonGameLibraryEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">,
): boolean {
  return isUnrealEngineAssetEntry(game) || isUbisoftDlcEntry(game);
}
