import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyCrossStoreSaveMigrationReadiness } from "../../../lib/cross-store-save-migration-readiness";
import { CrossStoreSaveMigrationReadinessPanel } from "./CrossStoreSaveMigrationReadinessPanel";

describe("CrossStoreSaveMigrationReadinessPanel", () => {
  it("renders local E2E readiness gates without save migration or provider claims", () => {
    render(
      <CrossStoreSaveMigrationReadinessPanel
        readiness={createVerifyCrossStoreSaveMigrationReadiness()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /cross-store save sync e2e readiness/i,
    });

    expect(within(panel).getByText("Cross-Store Save Sync E2E Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local Save Plan")).toBeInTheDocument();
    expect(within(panel).getByText("Variant Metadata")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Catalog Coverage")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Cloud Contract Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-Run Audit Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Native Copy Engine")).toBeInTheDocument();
    expect(within(panel).getByText("Path Mapping Matrix")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Cloud Transfer")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback Restore")).toBeInTheDocument();
    expect(within(panel).getByText("Local Sandbox E2E Proof")).toBeInTheDocument();
    expect(within(panel).getByText("Post-Copy Conflict Audit")).toBeInTheDocument();
    expect(within(panel).getByText("Migration Session Rehearsal")).toBeInTheDocument();
    expect(within(panel).getByText("Local readiness only")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-run audit before copy")).toBeInTheDocument();
    expect(
      within(panel).getByText("Native copy requires explicit desktop consent"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No automatic migration run")).toBeInTheDocument();
    expect(within(panel).getByText("Provider catalog coverage review only")).toBeInTheDocument();
    expect(within(panel).getByText("Provider cloud contract review only")).toBeInTheDocument();
    expect(within(panel).getByText("Provider path mapping review only")).toBeInTheDocument();
    expect(within(panel).getByText("Post-copy verification review only")).toBeInTheDocument();
    expect(within(panel).getByText("Local sandbox proof uses temp files only")).toBeInTheDocument();
    expect(within(panel).getByText("Migration session rehearsal review only")).toBeInTheDocument();
    expect(within(panel).getByText("No provider cloud transfer")).toBeInTheDocument();
    expect(within(panel).queryByText("Supabase/Keychain Staging Contract")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Supabase Bucket E2E")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Keychain Restore")).not.toBeInTheDocument();
    expect(
      within(panel).getByText("Rollback restore requires explicit desktop consent"),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /migration (started|complete|ready)|saves? (copied|migrated|transferred)|provider cloud (connected|live|synced|transfer complete)|path mapping (verified|ready|complete)|rollback (verified|ready|complete)|supabase\/keychain|live bucket e2e passed|key exported|keychain restored|live keychain restore complete/i,
    );
  });
});
