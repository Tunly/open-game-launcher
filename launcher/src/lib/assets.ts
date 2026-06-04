import { convertFileSrc } from "@tauri-apps/api/core";
import type { CSSProperties } from "react";

export function getGameAssetUrl(assetUrl?: string): string | undefined {
  if (!assetUrl) {
    return undefined;
  }

  return /^(https?:|data:|blob:)/i.test(assetUrl) ? assetUrl : convertFileSrc(assetUrl);
}

export function getGameBannerStyle(
  coverUrl?: string,
  options?: { backgroundPosition?: string; backgroundSize?: string },
): CSSProperties | undefined {
  const imageUrl = getGameAssetUrl(coverUrl);

  if (!imageUrl) {
    return undefined;
  }

  return {
    backgroundColor: "#171411",
    backgroundImage: `linear-gradient(90deg, rgba(23,20,17,0.1), rgba(23,20,17,0) 45%, rgba(23,20,17,0.1)), url("${imageUrl}")`,
    backgroundPosition: options?.backgroundPosition ?? "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: options?.backgroundSize ?? "cover",
  };
}
