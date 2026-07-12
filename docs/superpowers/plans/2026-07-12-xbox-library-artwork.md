# Xbox Library Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make installed and linked Xbox games render a usable Library icon and banner without exposing protected Windows package directories.

**Architecture:** The Rust scanner copies package artwork into the launcher's app-local asset root and exports the Microsoft Store product ID. Xbox TitleHub keeps its remote display image. TypeScript provider merging then joins installed, linked, and Game Pass rows by stable IDs first and conservative title normalization second.

**Tech Stack:** Rust/Tauri 2, React 19, TypeScript 6, Vitest 4, pnpm 9

## Global Constraints

- Preserve all unrelated dirty-worktree changes.
- Do not broaden Tauri asset scope to `C:\Program Files\WindowsApps`.
- Preserve the Retro Manga Launcher layout and existing `OG-Launcher` header/navigation.
- Do not add dependencies or change storage schemas.
- Use test-first red/green cycles for every behavior change.

---

### Task 1: Materialize installed Xbox package artwork

**Files:**
- Modify: `launcher/src-tauri/src/commands/games/detect/mod.rs`
- Test: inline `#[cfg(test)]` module in `launcher/src-tauri/src/commands/games/detect/mod.rs`

**Interfaces:**
- Consumes: existing `find_local_banner_asset`, `find_local_logo_asset`, `find_local_icon_asset`, `cached_image_extension_from_bytes`, `open_game_launcher_data_dir`.
- Produces: `find_xml_element_text(contents: &str, element: &str) -> Option<String>`, `xbox_store_product_id(path: &Path) -> Option<String>`, and an Xbox scan path that returns app-local cover/logo/icon paths.

- [ ] **Step 1: Write failing scanner tests**

Add tests that create a temporary `MicrosoftGame.config` containing a valid `<StoreId>9PFNXM9G4N83</StoreId>` and PNG-signature files referenced by `SplashScreenImage`, `StoreLogo`, and `Square44x44Logo`. Call an injected-root Xbox collector and assert:

```rust
assert_eq!(game.external_id.as_deref(), Some("9PFNXM9G4N83"));
assert!(game.cover_url.as_deref().is_some_and(|path| path.contains("xbox-assets")));
assert!(game.logo_url.as_deref().is_some_and(|path| path.contains("xbox-assets")));
assert!(game.icon_url.as_deref().is_some_and(|path| path.contains("xbox-assets")));
assert!(Path::new(game.cover_url.as_deref().unwrap()).is_file());
```

Add a second assertion that invalid/missing `StoreId` falls back to the existing slug external ID.

- [ ] **Step 2: Run the focused Rust test and verify RED**

Run: `cargo test --manifest-path launcher/src-tauri/Cargo.toml xbox --lib`

Expected: FAIL because Store ID extraction/materialization and the injected asset-root collector do not exist.

- [ ] **Step 3: Implement the minimal scanner pipeline**

Add a text-element parser and strict Store product validation:

```rust
fn find_xml_element_text(contents: &str, element: &str) -> Option<String> {
    let open_end = contents.find(&format!("<{element}>"))? + element.len() + 2;
    let close = contents[open_end..].find(&format!("</{element}>"))? + open_end;
    let value = contents[open_end..close].trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn normalize_xbox_store_id(value: &str) -> Option<String> {
    let value = value.trim();
    (value.len() == 12 && value.chars().all(|c| c.is_ascii_alphanumeric()))
        .then(|| value.to_ascii_uppercase())
}
```

Introduce `collect_xbox_games_from_roots_with_asset_root(roots, asset_root)` for test injection. Copy each discovered source image to `<asset_root>/<safe-game-key>-<kind>.<detected-extension>` using image signature validation. Production calls it with `open_game_launcher_data_dir().map(|root| root.join("xbox-assets"))`. Use the Store ID as `external_id`, falling back to `game.slug`.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test --manifest-path launcher/src-tauri/Cargo.toml xbox --lib`

Expected: all Xbox-related Rust tests pass.

---

### Task 2: Preserve TitleHub display artwork

**Files:**
- Modify: `launcher/src-tauri/src/commands/xbox.rs`
- Test: inline `#[cfg(test)]` module in `launcher/src-tauri/src/commands/xbox.rs`

**Interfaces:**
- Consumes: existing `Title`, `normalize_catalog_asset_url`, and `OwnedGame` mapping in `fetch_xbox_owned_games`.
- Produces: deserialized `displayImage` and HTTPS `cover_url`/`icon_url` for linked Xbox titles.

- [ ] **Step 1: Write the failing TitleHub test**

Deserialize a TitleHub fixture containing:

```json
{"titleId":"123","pfn":"Microsoft.Test_8wekyb3d8bbwe","name":"Test Game","type":"Game","devices":["PC"],"displayImage":"http://store-images.microsoft.com/test.png"}
```

Assert the artwork helper returns `https://store-images.microsoft.com/test.png`.

- [ ] **Step 2: Run and verify RED**

Run: `cargo test --manifest-path launcher/src-tauri/Cargo.toml commands::xbox::tests --lib`

Expected: FAIL because `Title` does not deserialize `displayImage` and no helper maps it.

- [ ] **Step 3: Implement minimal TitleHub mapping**

Add `display_image: Option<String>` with `#[serde(rename = "displayImage")]`, request the `image` decoration, normalize the URL through `normalize_catalog_asset_url`, and assign the result to both `cover_url` and `icon_url` while leaving `logo_url` unchanged.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test --manifest-path launcher/src-tauri/Cargo.toml commands::xbox::tests --lib`

Expected: all Xbox command tests pass.

---

### Task 3: Merge installed, linked, and Game Pass artwork

**Files:**
- Create: `launcher/src/library/providers/xbox-metadata.ts`
- Create: `launcher/src/library/providers/__tests__/xbox.test.ts`
- Modify: `launcher/src/library/providers/xbox.ts`
- Modify: `launcher/src/library/providers/gamepass.ts`
- Modify: `launcher/src/library/providers/__tests__/gamepass.test.ts`

**Interfaces:**
- Consumes: `Game`, `OwnedGame`, `ownedGameToGame`, and cached provider rows.
- Produces: `normalizeXboxCatalogTitle(value: string)`, `isProtectedXboxAsset(value?: string)`, and provider results with a single enriched Xbox row.

- [ ] **Step 1: Write failing provider tests**

Add tests for:

```ts
// Installed + linked: one installed row keeps install metadata and gains remote art.
expect(result.games).toEqual([
  expect.objectContaining({
    id: "xbox-installed",
    status: "installed",
    coverUrl: "https://xbox.example/display.png",
    iconUrl: "https://xbox.example/display.png",
  }),
]);

// Store ID wins even when localized titles differ.
expect(result.games[0]).toMatchObject({
  externalId: "9PFNXM9G4N83",
  coverUrl: "https://store-images.example/roadside.jpg",
});

// Conservative fallback recognizes the known preview qualifier.
expect(normalizeXboxCatalogTitle("Roadside Research (Spielvorschau)"))
  .toBe(normalizeXboxCatalogTitle("Roadside Research"));
```

Also assert that a protected `C:\Program Files\WindowsApps\...` primary asset does not block a valid HTTPS candidate.

- [ ] **Step 2: Run focused Vitest and verify RED**

Run: `pnpm --dir launcher test -- src/library/providers/__tests__/xbox.test.ts src/library/providers/__tests__/gamepass.test.ts`

Expected: FAIL because Xbox cache rows are only appended/discarded, Store IDs are not indexed for artwork merge, and preview qualifiers are not normalized.

- [ ] **Step 3: Implement shared Xbox metadata matching**

Create a small helper that strips existing PC/Windows suffixes plus only known preview suffixes (`Game Preview`, `Spielvorschau`) before the existing Unicode/alphanumeric normalization. Add a helper that recognizes protected `WindowsApps` paths.

In `mergeXboxOwned`, merge a cached Xbox row into an existing Xbox row by exact ID, exact external ID, then normalized title. Preserve installed lifecycle/launch fields and fill artwork. Prefer a valid remote image over a protected package path; retain unique icon/logo fallback candidates.

In `mergeGamePassCatalog`, build both product-ID and normalized-title indexes. Match `externalId` first, then title. Apply the same protected-path fallback rule and keep current product category/status semantics.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir launcher test -- src/library/providers/__tests__/xbox.test.ts src/library/providers/__tests__/gamepass.test.ts src/lib/__tests__/formatters.test.ts src/components/library/LibraryRow.test.tsx`

Expected: all focused tests pass.

---

### Task 4: Integrated verification

**Files:**
- No production files beyond Tasks 1–3.
- Store temporary screenshots/scripts outside the repository.

**Interfaces:**
- Consumes: completed Rust and TypeScript changes.
- Produces: passing validation evidence for the Xbox Library flow.

- [ ] **Step 1: Run formatting and static checks**

Run:

```powershell
cargo fmt --manifest-path launcher/src-tauri/Cargo.toml --check
pnpm --dir launcher typecheck
pnpm --dir launcher lint
```

Expected: exit code 0 for each command.

- [ ] **Step 2: Run focused and broad tests**

Run:

```powershell
cargo test --manifest-path launcher/src-tauri/Cargo.toml xbox --lib
pnpm --dir launcher test -- src/library/providers/__tests__/xbox.test.ts src/library/providers/__tests__/gamepass.test.ts src/lib/__tests__/formatters.test.ts src/components/library/LibraryRow.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Build the frontend**

Run: `pnpm --dir launcher build`

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Validate rendered behavior**

Browser plugin is not available in this session, so use the repository's Playwright-capable runtime without installing dependencies. Seed an Xbox Library fixture with valid cover/icon URLs, open the Library, select the Xbox game, and verify the row image and hero background render without framework overlays or console errors. Save screenshot evidence outside the repository.

- [ ] **Step 5: Review final diff**

Run: `git diff --check` and inspect only the intended Xbox artwork files. Confirm unrelated workspace changes were not overwritten.

