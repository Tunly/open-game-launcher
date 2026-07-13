# Local-Only Custom Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove automatic and hosted artwork features from the normal game-details UI while retaining manual Banner, Icon, and Logo selection in local storage.

**Architecture:** `GameDetails` will stop constructing auto/community candidates and stop calling the Supabase community-artwork client. The existing `useLibrarySync` manual-file preview and local-storage persistence path remains the sole custom-artwork write path. Hosted readiness diagnostics remain isolated behind their existing verification route.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri WebView localStorage

## Global Constraints

- Preserve the OG Launcher Retro Manga visual system in `docs/PROJECT_DESIGN.md`.
- Keep manual Banner, Icon, Logo, preview, confirmation, fallback, and reset behavior.
- Store confirmed custom artwork only under the existing `launcher.libraryCustomArtwork` local-storage entry.
- Do not call Supabase to list, upload, vote on, or report artwork from normal `GameDetails`.
- Preserve all unrelated existing working-tree changes.
- Do not remove hosted community-artwork migrations, backend modules, or isolated readiness/moderation verification panels.

---

### Task 1: Make GameDetails artwork controls local-only

**Files:**
- Modify: `launcher/src/components/library/GameDetails.test.tsx`
- Modify: `launcher/src/components/library/GameDetails.tsx`
- Modify: `launcher/src/components/library/GameDetailPanel.tsx`
- Modify: `launcher/src/components/library/GameDetailPanel.test.tsx`

**Interfaces:**
- Consumes: `openArtworkPreview(gameId: string, kind: CustomArtworkKind, file: File)` and `onResetCustomArtwork(gameId: string, kind?: CustomArtworkKind)`.
- Produces: A Custom Artwork settings section containing only Banner, Icon, Logo, and conditional Reset Artwork controls.

- [x] **Step 1: Write the failing component test**

Add this test to `GameDetails.test.tsx`:

```tsx
it("keeps custom artwork local-only", () => {
  renderGameDetails({
    coverUrl: "https://cdn.example.test/cover.jpg",
    iconUrl: "https://cdn.example.test/icon.jpg",
    logoUrl: "https://cdn.example.test/logo.png",
  });

  fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

  expect(screen.getByTitle("Choose custom banner artwork")).toBeVisible();
  expect(screen.getByTitle("Choose custom icon artwork")).toBeVisible();
  expect(screen.getByTitle("Choose custom logo artwork")).toBeVisible();
  expect(screen.queryByText("Auto Artwork")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: /hosted community artwork upload/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Community Art Deck")).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --dir launcher test -- GameDetails.test.tsx
```

Expected: FAIL because `Auto Artwork` and `Hosted community artwork upload` are still rendered.

- [x] **Step 3: Remove automatic and hosted artwork behavior**

In `GameDetails.tsx`, remove the imports and code paths for:

```ts
customArtworkHasKind
getAutoArtworkCandidates
getLocalCommunityArtworkCandidates
CommunityArtworkCandidate
CustomArtworkCandidate
listHostedCommunityArtworkCandidates
reportHostedCommunityArtwork
setHostedCommunityArtworkVote
uploadCommunityArtworkForGame
CommunityArtworkGallery
CommunityArtworkUploadPanel
CommunityArtworkUploadDraft
```

Delete the hosted upload MIME constants, hosted candidate/upload state, candidate-building memo blocks, hosted loading effect, and the apply/upload/vote/report handlers. Remove `onApplyCustomArtworkUrl` and `seedHostedArtworkUploadPending` from `GameDetailsProps` and its destructuring.

Replace the Custom Artwork body after the Banner/Icon/Logo button grid with only the existing reset/fallback block:

```tsx
{hasCustomArtwork(customArtwork) ? (
  <button
    type="button"
    className="mt-2 flex h-8 w-full items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase transition hover:bg-[#efe3cf]"
    onClick={() => {
      if (primaryArtworkGameId) {
        onResetCustomArtwork(primaryArtworkGameId);
      }
    }}
  >
    <RotateCcw className="h-3.5 w-3.5" />
    Reset Artwork
  </button>
) : (
  <p className="mt-2 text-[10px] font-bold text-[#655f58] uppercase">
    Uses scanned launcher art.
  </p>
)}
```

In `GameDetailPanel.tsx`, stop passing:

```tsx
onApplyCustomArtworkUrl={ctx.sync.handleApplyCustomArtworkUrl}
seedHostedArtworkUploadPending={verifyMode === "hosted-community-artwork"}
```

In `GameDetailPanel.test.tsx`, remove the mock prop and assertion for `Seed hosted pending upload`; retain assertions for the isolated hosted readiness and moderation panels.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --dir launcher test -- GameDetails.test.tsx GameDetailPanel.test.tsx useLibrarySync.test.tsx
```

Expected: all focused tests PASS, including the existing manual artwork preview/confirm/reset coverage.

- [x] **Step 5: Run repository UI checks**

Run:

```powershell
pnpm --dir launcher typecheck
pnpm --dir launcher lint
pnpm --dir launcher build
```

Expected: all three commands exit with code 0 and no new warnings.

- [x] **Step 6: Review the final diff**

Run:

```powershell
git diff -- launcher/src/components/library/GameDetails.tsx launcher/src/components/library/GameDetails.test.tsx launcher/src/components/library/GameDetailPanel.tsx launcher/src/components/library/GameDetailPanel.test.tsx
```

Expected: only local-artwork changes plus the pre-existing unrelated hunks remain. Do not commit the implementation from this dirty working tree because `GameDetails.tsx` and related files already contain unrelated user changes.
