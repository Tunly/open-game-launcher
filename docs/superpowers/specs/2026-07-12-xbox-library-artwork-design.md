# Xbox Library Artwork Design

## Goal

Ensure Xbox games in the Library show a usable icon and banner whether they were discovered from an installed Windows package, imported from Xbox title history, or enriched from the PC Game Pass catalog.

## Root Cause

Installed Xbox packages already expose artwork paths through `MicrosoftGame.config`, but the paths commonly live below `C:\Program Files\WindowsApps`, outside the Tauri asset protocol scope. The UI receives truthy yet unloadable URLs, which suppresses the banner placeholder while every icon candidate fails.

The Xbox title-history import also discards its remote display image. PC Game Pass can provide richer Store artwork, but enrichment currently matches only a narrowly normalized title. Localized catalog suffixes such as `(Game Preview)` and `(Spielvorschau)` prevent the match, while the scanner ignores the stable Microsoft Store product ID already present in `MicrosoftGame.config`.

## Design

### Installed package artwork

The native Xbox scanner will materialize package artwork into an app-owned Xbox asset directory below `$APPLOCALDATA`. Library records will reference the copied files rather than protected package paths. The implementation will reuse the existing provider-asset materialization pattern and preserve the current artwork priority: icon, logo, then cover.

The scanner will also parse `<StoreId>` from `MicrosoftGame.config` and expose a validated 12-character Microsoft Store product ID as `externalId`. If the config has no valid Store ID, existing slug-based behavior remains as a compatibility fallback.

### Linked Xbox artwork

The TitleHub request will include image decoration and deserialize `displayImage`. Valid HTTP(S) URLs will be normalized to HTTPS. The display image will populate the imported title's cover and icon fallback so linked Xbox titles outside PC Game Pass still have artwork.

### Provider merging

Installed and linked Xbox rows will be enriched rather than discarded when they represent the same title. Matching priority is stable Microsoft Store product ID, package/title identifiers, and normalized title fallback. Existing playable/install metadata remains authoritative; artwork fills only missing or unusable candidates.

PC Game Pass enrichment will match by Store product ID before title. Its title fallback will remove only known Xbox catalog qualifiers, including localized preview labels, without collapsing meaningful editions. Remote cover/logo candidates will remain available when a local candidate cannot be rendered.

### UI behavior

No visual redesign is required. `LibraryRow` already falls back from icon to logo and cover, and `GameDetails` already renders a cover as the hero banner. Once the asset pipeline supplies usable URLs, both surfaces render within the existing Retro Manga Launcher visual system.

## Error Handling

- Failure to copy one local asset must not hide the game; remaining local and remote candidates are retained.
- Malformed Store IDs and image URLs are ignored.
- Xbox or Game Pass network failure keeps installed games and cached metadata visible.
- Existing legacy cache rows remain readable and continue to use title fallback matching.

## Testing

- Rust scanner regression: protected-package-style source assets are copied into an app-owned destination and returned as cover/icon paths.
- Rust config regression: a valid `<StoreId>` becomes `externalId`; invalid or missing values preserve compatibility fallback.
- Rust TitleHub regression: `displayImage` is normalized and mapped to artwork.
- TypeScript Xbox provider regression: installed and linked rows merge without duplication and retain usable artwork candidates.
- TypeScript Game Pass regression: Store ID matching wins; `Roadside Research` matches localized preview catalog titles.
- Existing formatter, LibraryRow, provider, typecheck, lint, Rust, and build checks remain green.

## Non-Goals

- No new artwork service or database schema.
- No broad Tauri access to all of `WindowsApps`.
- No change to the Library layout or visual design.
- No heuristic removal of arbitrary edition names.
