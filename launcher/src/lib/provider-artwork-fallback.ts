/**
 * Compatibility shim: the title-map artwork candidates now live in
 * `./artwork-resolver` with the map itself as data in
 * `./artwork-title-map`. New code should import from `./artwork-resolver`.
 */
export { getKnownProviderArtworkCandidates } from "./artwork-resolver";
export { STEAM_APP_IDS_BY_TITLE } from "./artwork-title-map";
