/**
 * Compatibility shim: the artwork fallback logic now lives in
 * `./artwork-resolver`. Kept as a re-export so existing call sites and
 * tests stay stable; new code should import from `./artwork-resolver`.
 */
export {
  applyArtworkFallback,
  getSteamArtworkFallback,
  getSteamArtworkFallbacks,
} from "./artwork-resolver";
