# Performance Optimization Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Reduce chunk sizes and improve runtime performance by splitting the launcher.ts monolith, lazy-loading settings panels, fixing ineffective dynamic imports, and splitting vendor chunks.

**Architecture:** Domain-based splitting of `launcher.ts` into focused modules, lazy loading of heavy settings components, and Vite config optimization for vendor chunking.

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind 3, Tauri

---

## Analysis

### Current State (build output)
| Chunk | Size | Gzipped | Issue |
|-------|------|---------|-------|
| LibraryPage | 482KB | 106KB | Heavy components bundled |
| SettingsPage | 355KB | 75KB | Imports 2285-line monolith |
| vendor-react | 520KB | 153KB | Expected (React 19) |
| vendor (misc) | 241KB | 72KB | Needs splitting |
| vendor-supabase | 195KB | 50KB | OK |
| DownloadsPage | 150KB | 32KB | Moderate |
| CommunityPage | 129KB | 25KB | Moderate |

### Root Causes
1. `launcher.ts` is a 2285-line monolith with 187 exports
2. SettingsPage imports ALL 20+ settings components statically
3. `config.ts` has INEFFECTIVE_DYNAMIC_IMPORT warning
4. Vendor chunk not split for react-router-dom, zod, etc.

---

## Task 1: Split launcher.ts into domain modules

**Objective:** Break the 2285-line monolith into focused domain modules.

**Files:**
- Create: `src/lib/launcher/steam.ts`
- Create: `src/lib/launcher/gog.ts`
- Create: `src/lib/launcher/epic.ts`
- Create: `src/lib/launcher/ea.ts`
- Create: `src/lib/launcher/xbox.ts`
- Create: `src/lib/launcher/battlenet.ts`
- Create: `src/lib/launcher/plugins.ts`
- Create: `src/lib/launcher/installs.ts`
- Create: `src/lib/launcher/system.ts`
- Create: `src/lib/launcher/crossplay.ts`
- Create: `src/lib/launcher/crossstore.ts`
- Create: `src/lib/launcher/lan.ts`
- Create: `src/lib/launcher/performance.ts`
- Create: `src/lib/launcher/client-manager.ts`
- Create: `src/lib/launcher/index.ts` (barrel re-export)
- Modify: `src/lib/launcher.ts` → delete (replaced by index.ts)
- Modify: All imports of `../lib/launcher` → `../lib/launcher/index`

**Step 1: Create domain modules**
Extract functions by domain:
- Steam: `openSteamLoginWindow`, `normalizeSteamOwnedGames`, `fetchSteamProfileName`, `fetchSteamOwnedGames`
- GOG: `gogExchangeCode`, `gogLogout`, `gogGetToken`, `openGogLoginWindow`
- Epic: `openEpicLoginWindow`, `authenticateEpicLegendary`, `readEpicSessionMarker`, `writeEpicSessionMarker`, `clearEpicSessionMarker`
- EA: `eaGetToken`, `eaLogout`, `openEaLoginWindow`
- Xbox: `openXboxLoginWindow`, `fetchXboxOwnedGames`
- BattleNet: `openBattleNetLoginWindow`, `processBattleNetGamesPayload`
- Plugins: `auditStagedPluginRegistry`, `provePluginRuntimeSandbox`, `reviewPluginActivationPlan`, etc.
- Installs: `launchGame`, `installGame`, `uninstallGame`, `getInstalledGames`, etc.
- System: `getSystemInfo`, `getDefaultInstallDir`, `getDiskInfo`, etc.
- CrossPlay: `launchCrossPlayJoin`
- CrossStore: `crossStoreSaveApply`, `crossStoreSaveRollback`, etc.
- LAN: `lanTransferCopy`, `lanTransferPeerDiscovery`, etc.
- Performance: `writeActivePerformanceGameContext`
- ClientManager: `proveClientManagerMountApplySandbox`, `getClientManagerStatus`, etc.

**Step 2: Create barrel index.ts**
```typescript
// src/lib/launcher/index.ts
export * from './steam';
export * from './gog';
export * from './epic';
export * from './ea';
export * from './xbox';
export * from './battlenet';
export * from './plugins';
export * from './installs';
export * from './system';
export * from './crossplay';
export * from './crossstore';
export * from './lan';
export * from './performance';
export * from './client-manager';
```

**Step 3: Update all imports**
Search for `from "../lib/launcher"` and `from "../../lib/launcher"` and update to use the new path.

**Step 4: Verify build**
Run `pnpm build` — should produce same output, smaller vendor chunk.

---

## Task 2: Lazy-load Settings panels

**Objective:** Reduce SettingsPage chunk from 355KB by lazy-loading heavy panels.

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Step 1: Identify heavy imports**
SettingsPage imports 20+ components statically. Lazy-load the heavy ones:
- `ActivitySection`
- `PlatformHealthPanel`
- `PluginSystemReadinessPanel`
- `ExternalCompletionEvidenceSummaryPanel`
- `HostedCronEvidenceSummaryPanel`
- `OneClickSetupE2EReadinessPanel`
- `OneClickSetupReadinessPanel`
- `OneClickSetupRollbackAuditContractPanel`

**Step 2: Convert to lazy imports**
```typescript
const ActivitySection = lazy(() => import('../components/settings/ActivitySection'));
const PlatformHealthPanel = lazy(() => import('../components/settings/PlatformHealthPanel'));
// ... etc
```

**Step 3: Wrap in Suspense**
Add `<Suspense fallback={null}>` around lazy components.

**Step 4: Verify build**
SettingsPage chunk should drop significantly.

---

## Task 3: Fix INEFFECTIVE_DYNAMIC_IMPORT

**Objective:** Fix the warning about config.ts being both dynamically and statically imported.

**Files:**
- Modify: `src/lib/supabase/config.ts`
- Modify: `src/lib/launcher.ts` (or new launcher/installs.ts)
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/app/providers/AuthProvider.tsx`

**Step 1: Check who imports config.ts statically**
Find all static imports of `supabase/config`.

**Step 2: Make config.ts a pure dynamic import everywhere**
Ensure config.ts is only loaded via `import()` where needed, or make it a small shared constant.

---

## Task 4: Split vendor chunks

**Objective:** Split the 241KB vendor chunk into smaller, cacheable pieces.

**Files:**
- Modify: `vite.config.ts`

**Step 1: Update manualChunks**
```typescript
manualChunks(id) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@supabase")) return "vendor-supabase";
  if (id.includes("lucide-react")) return "vendor-icons";
  if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
  if (id.includes("react-router") || id.includes("react-dom")) return "vendor-router";
  if (id.includes("zod")) return "vendor-zod";
  if (id.includes("@tauri-apps")) return "vendor-tauri";
  if (id.includes("zustand")) return "vendor-zustand";
  return "vendor";
}
```

**Step 2: Verify build**
vendor chunk should split into smaller pieces.

---

## Task 5: Optimize LibraryPage components

**Objective:** Reduce LibraryPage chunk by lazy-loading heavy sub-components.

**Files:**
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/components/library/GameDetailPanel.tsx` (if heavy)

**Step 1: Lazy-load GameDetailPanel**
```typescript
const GameDetailPanel = lazy(() => import('../components/library/GameDetailPanel'));
```

**Step 2: Lazy-load AddGameDialog and ProviderPickerDialog**
```typescript
const AddGameDialog = lazy(() => import('../components/library/AddGameDialog'));
const ProviderPickerDialog = lazy(() => import('../components/library/ProviderPickerDialog'));
```

**Step 3: Verify build**
LibraryPage chunk should drop.

---

## Verification

After all tasks:
1. Run `pnpm build` — check chunk sizes
2. Compare before/after sizes
3. Verify no runtime errors in `pnpm tauri dev`
4. Check that all pages load correctly

## Expected Results
- SettingsPage: 355KB → ~150KB
- LibraryPage: 482KB → ~250KB
- vendor: 241KB → ~80KB (split into router, zod, tauri, zustand)
- Total bundle reduction: ~40%
