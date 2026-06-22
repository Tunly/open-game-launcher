import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildCrossStoreSaveSyncPlan,
  createVerifyCrossStoreSaveSyncCandidates,
} from "../../../lib/cross-store-save-sync-planner";
import { CrossStoreSaveSyncPlanner } from "./CrossStoreSaveSyncPlanner";

describe("CrossStoreSaveSyncPlanner", () => {
  it("renders local review lanes without migration or provider action claims", () => {
    const plan = buildCrossStoreSaveSyncPlan(createVerifyCrossStoreSaveSyncCandidates());

    render(<CrossStoreSaveSyncPlanner plan={plan} />);

    const panel = screen.getByRole("region", { name: /cross-store save sync planner/i });

    expect(within(panel).getByText("Cross-Store Saves")).toBeInTheDocument();
    expect(within(panel).getAllByText(/Steam -> GOG/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Review Plan Only")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-Run Audit Packet")).toBeInTheDocument();
    expect(within(panel).getByText("No copy performed")).toBeInTheDocument();
    expect(within(panel).getAllByText(/conflict-steam-slot-1-gog-slot-1/i).length).toBeGreaterThan(
      0,
    );
    expect(
      within(panel).getByText(/rollback-preview-steam-mech-arcade-to-gog-mech-arcade/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Provider Catalog")).toBeInTheDocument();
    expect(within(panel).getByText("Local IDs")).toBeInTheDocument();
    expect(within(panel).getAllByText(/steam:110011/i).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/gog:mech-arcade/i).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/epic:mech-arcade-epic/i).length).toBeGreaterThan(0);
    expect(
      within(panel).getByText(/Provider catalog coverage is local metadata review only/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Still Blocked After Catalog Packet")).toBeInTheDocument();
    expect(within(panel).getAllByText("Provider Path/ID Fixtures").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Fixture Review")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Provider path\/id mapping fixtures are local metadata review only/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("C:\\Games\\Steam\\steamapps\\common\\Mech Arcade"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("C:\\Games\\GOG Galaxy\\Games\\Mech Arcade"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/Save root cannot be derived from tracked save files/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("steam_userdata_remote")).toBeInTheDocument();
    expect(within(panel).getByText("gog_documents_game_folder")).toBeInTheDocument();
    expect(within(panel).getByText("epic_localappdata_saved")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Provider save-root discovery APIs are not called/i),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText("Provider Cloud Contract").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Transfer Blocked")).toBeInTheDocument();
    expect(within(panel).getByText(/Steam user auth/i)).toBeInTheDocument();
    expect(within(panel).getByText(/GOG Galaxy account auth/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Epic\/EOS user auth/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/no provider cloud save listing, export, import/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/Provider-approved OAuth\/device auth evidence is not attached/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Still Blocked After Contract Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Path Map")).toBeInTheDocument();
    expect(within(panel).getByText("Review Only")).toBeInTheDocument();
    expect(
      within(panel).getAllByText("C:\\Users\\Player\\Saved Games\\Mech Arcade").length,
    ).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText("C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade").length,
    ).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/profile\.sav -> profile\.sav/i).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/settings\.json -> settings\.json/i).length).toBeGreaterThan(
      0,
    );
    expect(within(panel).getByText(/Rule: steam-profile/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Rule: steam-settings/i)).toBeInTheDocument();
    expect(within(panel).getByText(/reviewed file actions/i)).toBeInTheDocument();
    expect(within(panel).getAllByText("Automatic Path-Map Apply").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Consent Required")).toBeInTheDocument();
    expect(within(panel).getByText("false")).toBeInTheDocument();
    expect(
      within(panel).getByText(/accepted stays false until the desktop user confirms/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/desktop apply requires accepted consent, matching roots/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Still Blocked After Request Template")).toBeInTheDocument();
    expect(within(panel).getByText("Native Apply Proof")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop Consent")).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/cross_store_save_native_copy_apply/i).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/og-cross-store-save-apply.json/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Native Rollback Proof")).toBeInTheDocument();
    expect(within(panel).getByText(/cross_store_save_native_copy_rollback/i)).toBeInTheDocument();
    expect(within(panel).getByText(/deletes newly copied files/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/Copied file size\/SHA-256 match after copy/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Still Blocked After Native Copy")).toBeInTheDocument();
    expect(within(panel).getAllByText("Post-Copy Verification").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Review Packet")).toBeInTheDocument();
    expect(within(panel).getByText(/Snapshot Review/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Hash Review/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/Pre-copy target snapshot exists before overwrite review/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/Post-copy target size and SHA-256 match/i).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByText("Still Blocked After Verification Packet")).toBeInTheDocument();
    expect(within(panel).getAllByText("Supabase/Keychain Staging").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Redacted Contract")).toBeInTheDocument();
    expect(
      within(panel).getAllByText(
        /auth\.uid\(\)\/cross-store-save-staging\/mech-arcade\/<redacted-proof>\//i,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(panel).getByText(/cross_store_save_supabase_keychain_staging/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/No key export/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/Provider transfer skipped/i).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/get_or_create_user_keyring_key/i).length).toBeGreaterThan(0);
    expect(
      within(panel).getByText(/does not upload, download, decrypt, restore, or delete live/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Still Blocked After Staging Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Migration Session Rehearsal")).toBeInTheDocument();
    expect(within(panel).getByText("Rehearsal Only")).toBeInTheDocument();
    expect(within(panel).getByText(/Native Apply Consent/i)).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/cross_store_save_native_copy_apply/i).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByText(/Still Blocked After Rehearsal Packet/i)).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/Real user-data migration sessions are still not executed/i)
        .length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByText("Local review only")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-run audit before copy")).toBeInTheDocument();
    expect(
      within(panel).getByText("Native copy requires explicit desktop consent"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No automatic save migration")).toBeInTheDocument();
    expect(within(panel).getByText("No browser file mutation")).toBeInTheDocument();
    expect(within(panel).getByText("No provider cloud transfer")).toBeInTheDocument();
    expect(within(panel).getByText("Provider cloud contract review only")).toBeInTheDocument();
    expect(within(panel).getByText("Provider catalog coverage review only")).toBeInTheDocument();
    expect(within(panel).getByText("Provider path/id fixture review only")).toBeInTheDocument();
    expect(
      within(panel).getByText("Automatic path-map apply is consent-gated"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Post-copy verification review only")).toBeInTheDocument();
    expect(
      within(panel).getByText("Supabase/keychain staging proof review only"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Migration session rehearsal review only")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic rollback execution")).toBeInTheDocument();
    expect(within(panel).getByText("No live Supabase/keychain bucket E2E")).toBeInTheDocument();
    expect(within(panel).getAllByText(/review-only/i).length).toBeGreaterThan(0);
    expect(panel).not.toHaveTextContent(/not implemented/i);
    expect(panel).not.toHaveTextContent(
      /migration (started|complete|ready)|saves? (migrated|transferred)|provider cloud (connected|live|synced|transfer complete)|path mapping (verified|ready|complete)|rollback (verified|ready|complete)|supabase\/keychain bucket e2e (passed|ready)|live bucket e2e passed|copy complete/i,
    );
  });
});
