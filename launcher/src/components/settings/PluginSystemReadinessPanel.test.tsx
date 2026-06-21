import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createVerifyPluginMarketplaceUpdateIndexTrustReadiness,
  createVerifyPluginRuntimeSandboxReadiness,
  createVerifyPluginUpdateSigningReadiness,
  createVerifyPluginSystemReadiness,
  type PluginActivationPlanReviewEvidence,
} from "../../lib/plugin-system-readiness";
import { PluginSystemReadinessPanel } from "./PluginSystemReadinessPanel";

describe("PluginSystemReadinessPanel", () => {
  it("renders local manifest readiness without execution or marketplace claims", () => {
    render(<PluginSystemReadinessPanel readiness={createVerifyPluginSystemReadiness()} />);

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });

    expect(within(panel).getByText("Plugin Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Manifest Schema")).toBeInTheDocument();
    expect(within(panel).getAllByText("Policy Ledger").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Runtime Sandbox")).toBeInTheDocument();
    expect(within(panel).getByText("Marketplace")).toBeInTheDocument();
    expect(
      within(panel).getByText(/does not load, execute, enable, update, install, or sell plugins/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Local manifest review")).toBeInTheDocument();
    expect(within(panel).getByText("Static policy ledger only")).toBeInTheDocument();
    expect(within(panel).getByText("Deny-by-default permissions")).toBeInTheDocument();
    expect(within(panel).getByText("No plugin execution")).toBeInTheDocument();
    expect(within(panel).getByText("Native disabled registry audit")).toBeInTheDocument();
    expect(within(panel).getByText("Native runtime admission proof")).toBeInTheDocument();
    expect(within(panel).getByText("Signed package stages disabled")).toBeInTheDocument();
    expect(within(panel).getByText("No permission grant persisted")).toBeInTheDocument();
    expect(within(panel).getByText("No marketplace publish")).toBeInTheDocument();
    expect(within(panel).getByText("No auto-update install")).toBeInTheDocument();
    expect(within(panel).getByText("No theme/app shell injection")).toBeInTheDocument();
    expect(within(panel).getByText("Manifest Ledger")).toBeInTheDocument();
    expect(within(panel).getByText("Native Disabled Registry Audit")).toBeInTheDocument();
    expect(within(panel).getByText(/stage-record status, hashes, signature/i)).toBeInTheDocument();
    expect(within(panel).getByText("Native Runtime Sandbox Dry-Run")).toBeInTheDocument();
    expect(
      within(panel).getByText(/No native runtime sandbox proof has been run/i),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText(/codeExecuted false/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Browser Display Cache")).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/library-tags-exporter \/\/ 0\.3\.1/i).length,
    ).toBeGreaterThan(1);
    expect(within(panel).getByText(/Ed25519 signature, file hashes/i)).toBeInTheDocument();
    expect(within(panel).getByText("Library Tags Exporter")).toBeInTheDocument();
    expect(within(panel).getByText("Manga Theme Pack")).toBeInTheDocument();
    expect(within(panel).getByText("Broken Runtime Demo")).toBeInTheDocument();
    expect(within(panel).getByText("Permission Ledger")).toBeInTheDocument();
    expect(within(panel).getByText("Schema Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Permission Denials")).toBeInTheDocument();
    expect(within(panel).getByText(/Denied permissions: process:spawn/i)).toBeInTheDocument();
    expect(within(panel).getByText("downloads:write")).toBeInTheDocument();
    expect(within(panel).getAllByText("process:spawn").length).toBeGreaterThan(0);
    expect(within(panel).getByText("theme:profile")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /plugin executed true|marketplace live|auto-update installed|permission granted/i,
    );
  });

  it("distinguishes native registry audit evidence from browser display cache", () => {
    render(<PluginSystemReadinessPanel readiness={createVerifyPluginSystemReadiness()} />);

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Native Disabled Registry Audit")).toBeInTheDocument();
    expect(within(panel).getByText("Browser Display Cache")).toBeInTheDocument();
    expect(within(panel).getByText(/0 blocked/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/hash, signature, path, and stage-record audit/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/library-tags-exporter \/\/ 0\.3\.1/i).length,
    ).toBeGreaterThan(1);
    expect(panel).not.toHaveTextContent(/plugin executed|runtime ready|marketplace live/i);
  });

  it("renders runtime sandbox process-boundary proof without enabling plugins", () => {
    render(<PluginSystemReadinessPanel readiness={createVerifyPluginRuntimeSandboxReadiness()} />);

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Native Runtime Sandbox Process Proof")).toBeInTheDocument();
    expect(within(panel).getByText(/Process Boundary: ready/i)).toBeInTheDocument();
    expect(within(panel).getByText(/IPC Allowlist: deny-all proof/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Permission Grants: none/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/codeExecuted false/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Escape Fixture Matrix")).toBeInTheDocument();
    expect(within(panel).getByText(/8 blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Path Traversal Entrypoint/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Deny-All IPC Invoke/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Symlink Entrypoint Escape/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Nested Manifest Path Escape/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Network IPC Fetch/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/Permission Escalation/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Payload: \.\.\/secrets\/token\.txt/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Payload: plugins\/\.\.\/manifest\.json/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Payload: process:spawn/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/Result: blocked-by-admission/i)).toHaveLength(8);
    expect(within(panel).getAllByText(/owned process boundary proved/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/staged package remains disabled/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /plugin executed true|permission granted|marketplace live|auto-update installed|runtime ready|production sandbox ready/i,
    );
  });

  it("does not show process-proof success copy for unsafe process-like evidence", () => {
    const readiness = createVerifyPluginRuntimeSandboxReadiness();
    render(
      <PluginSystemReadinessPanel
        readiness={{
          ...readiness,
          runtimeSandboxProof: {
            ...readiness.runtimeSandboxProof!,
            allowedExecutionCount: 1,
            codeExecuted: true,
          },
        }}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Native Runtime Sandbox Proof Blocked")).toBeInTheDocument();
    expect(
      within(panel).queryByText("Native Runtime Sandbox Process Proof"),
    ).not.toBeInTheDocument();
    expect(within(panel).getByText(/unsafe or incomplete/i)).toBeInTheDocument();
    expect(within(panel).getByText(/codeExecuted true/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /Owned process boundary is proved for the local admission lane/i,
    );
  });

  it("renders update signing review evidence without auto-update install claims", () => {
    render(<PluginSystemReadinessPanel readiness={createVerifyPluginUpdateSigningReadiness()} />);

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Local Update Signing Review")).toBeInTheDocument();
    expect(within(panel).getByText(/1 signed \/ install blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Manifest Hash: ready/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Rollback Plan: ready/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Auto Install: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/verified-plugin \/\/ 0\.3\.1 -> 0\.3\.2/i)).toBeInTheDocument();
    expect(within(panel).getByText(/sha256:/i)).toBeInTheDocument();
    expect(within(panel).getAllByText(/review-only/i).length).toBeGreaterThan(0);
    expect(panel).not.toHaveTextContent(
      /auto-update installed|plugin executed true|marketplace live|permission granted/i,
    );
  });

  it("renders an empty update signing ledger when no review evidence exists", () => {
    render(<PluginSystemReadinessPanel readiness={createVerifyPluginSystemReadiness()} />);

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Local Update Signing Review")).toBeInTheDocument();
    expect(within(panel).getAllByText(/not reviewed/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/No local update signing review envelope/i)).toBeInTheDocument();
  });

  it("renders native review command controls and triggers handlers", () => {
    const onActivationConsentOperationChange = vi.fn();
    const onActivationPluginIdChange = vi.fn();
    const onActivationVersionChange = vi.fn();
    const onChooseMarketplaceIndex = vi.fn();
    const onChooseUpdateEnvelope = vi.fn();
    const onMarketplaceIndexPathChange = vi.fn();
    const onReviewActivationPlan = vi.fn();
    const onReviewMarketplaceIndex = vi.fn();
    const onReviewUpdateEnvelope = vi.fn();
    const onUpdateEnvelopePathChange = vi.fn();

    render(
      <PluginSystemReadinessPanel
        readiness={createVerifyPluginSystemReadiness()}
        reviews={{
          activationConsentOperation: "review_plugin_activation_plan:library-tags-exporter@0.3.1",
          activationPluginId: "library-tags-exporter",
          activationVersion: "0.3.1",
          isDesktopRuntime: true,
          marketplaceIndexPath: "/tmp/marketplace-index.json",
          message: "Native review command queued.",
          updateEnvelopePath: "/tmp/update-envelope.json",
          onActivationConsentOperationChange,
          onActivationPluginIdChange,
          onActivationVersionChange,
          onChooseMarketplaceIndex,
          onChooseUpdateEnvelope,
          onMarketplaceIndexPathChange,
          onReviewActivationPlan,
          onReviewMarketplaceIndex,
          onReviewUpdateEnvelope,
          onUpdateEnvelopePathChange,
        }}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Native Review Commands")).toBeInTheDocument();
    expect(within(panel).getByText("Review Only")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /without downloading, installing, enabling, or executing plugin code/i,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Native review command queued.")).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText(/plugin activation review plugin id/i), {
      target: { value: "updated-plugin" },
    });
    fireEvent.change(within(panel).getByLabelText(/plugin activation review version/i), {
      target: { value: "1.0.0" },
    });
    fireEvent.change(within(panel).getByLabelText(/plugin activation review consent operation/i), {
      target: { value: "review_plugin_activation_plan:updated-plugin@1.0.0" },
    });
    fireEvent.change(within(panel).getByLabelText(/plugin update envelope path/i), {
      target: { value: "/tmp/updated-envelope.json" },
    });
    fireEvent.change(within(panel).getByLabelText(/plugin marketplace index path/i), {
      target: { value: "/tmp/updated-marketplace.json" },
    });

    fireEvent.click(within(panel).getByRole("button", { name: /review activation/i }));
    const fileButtons = within(panel).getAllByRole("button", { name: /^file$/i });
    fireEvent.click(fileButtons[0]);
    fireEvent.click(fileButtons[1]);
    const reviewButtons = within(panel).getAllByRole("button", { name: /^review$/i });
    fireEvent.click(reviewButtons[0]);
    fireEvent.click(reviewButtons[1]);

    expect(onActivationPluginIdChange).toHaveBeenCalledWith("updated-plugin");
    expect(onActivationVersionChange).toHaveBeenCalledWith("1.0.0");
    expect(onActivationConsentOperationChange).toHaveBeenCalledWith(
      "review_plugin_activation_plan:updated-plugin@1.0.0",
    );
    expect(onUpdateEnvelopePathChange).toHaveBeenCalledWith("/tmp/updated-envelope.json");
    expect(onMarketplaceIndexPathChange).toHaveBeenCalledWith("/tmp/updated-marketplace.json");
    expect(onReviewActivationPlan).toHaveBeenCalledTimes(1);
    expect(onChooseUpdateEnvelope).toHaveBeenCalledTimes(1);
    expect(onChooseMarketplaceIndex).toHaveBeenCalledTimes(1);
    expect(onReviewUpdateEnvelope).toHaveBeenCalledTimes(1);
    expect(onReviewMarketplaceIndex).toHaveBeenCalledTimes(1);
  });

  it("renders activation plan review ledger without execution or install claims", () => {
    const activationPlanReview: PluginActivationPlanReviewEvidence = {
      autoInstallAllowed: false,
      checks: [
        {
          detail: "Disabled registry entry was re-audited before activation.",
          id: "disabled-registry",
          label: "Disabled Registry",
          status: "pass",
        },
        {
          detail: "Production sandbox remains unavailable, so activation is blocked.",
          id: "production-sandbox",
          label: "Production Sandbox",
          status: "blocked",
        },
      ],
      codeExecuted: false,
      downloadAttempted: false,
      entrypoint: "dist/main.js",
      installApplied: false,
      manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
      networkAllowed: false,
      permissionGrantsPersisted: false,
      pluginId: "library-tags-exporter",
      processBoundaryReady: true,
      registryPath: "app-data/plugins/staged/library-tags-exporter/0.3.1",
      reviewedAt: "2026-06-15T00:04:00.000Z",
      sourceLabel: "Native activation plan review",
      status: "blocked-production-sandbox",
      version: "0.3.1",
    };

    render(
      <PluginSystemReadinessPanel
        readiness={{
          ...createVerifyPluginSystemReadiness(),
          activationPlanReview,
        }}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Local Activation Plan Review")).toBeInTheDocument();
    expect(within(panel).getByText("blocked-production-sandbox")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /no download, install, permission grant, network access, or code execution/i,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/Code Executed: false/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Download: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Install: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Process Boundary: review-only/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /Native activation plan review \/\/ library-tags-exporter \/\/ 0\.3\.1 \/\/ 2026-06-15T00:04:00\.000Z/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a/i,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Disabled Registry")).toBeInTheDocument();
    expect(within(panel).getByText("Production Sandbox")).toBeInTheDocument();
    expect(within(panel).getByText(/re-audited before activation/i)).toBeInTheDocument();
    expect(within(panel).getByText(/activation is blocked/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /Code Executed: true|Download: attempted|Install: applied|permission granted|network allowed/i,
    );
  });

  it("renders signed marketplace update-index trust evidence without install claims", () => {
    render(
      <PluginSystemReadinessPanel
        readiness={createVerifyPluginMarketplaceUpdateIndexTrustReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Local Marketplace Index Trust")).toBeInTheDocument();
    expect(within(panel).getByText(/1 signed \/ 1 matched/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Signature: verified/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Downloads: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Installs: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Auto Updates: blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/verified-plugin \/\/ 0\.3\.2/i)).toBeInTheDocument();
    expect(within(panel).getByText(/approved \/\/ stable/i)).toBeInTheDocument();
    expect(within(panel).getByText(/trusted-disabled-match/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /download allowed|install allowed|auto-update installed|plugin executed true|production trust ready/i,
    );
  });

  it("renders local discovery controls for scan, JSON import, and reset", () => {
    const onChooseFolder = vi.fn();
    const onImportFile = vi.fn();
    const onReset = vi.fn();

    render(
      <PluginSystemReadinessPanel
        discovery={{
          discoveryPath: "local-plugin-fixtures.json",
          importedAt: "2026-06-13T10:00:00.000Z",
          isDesktopRuntime: false,
          message: "Imported 1 manifest for local review.",
          scannedFileCount: 1,
          skippedEntries: ["broken/plugin.json: invalid JSON"],
          sourceLabel: "Browser JSON import",
          onChooseFolder,
          onImportFile,
          onReset,
        }}
        readiness={createVerifyPluginSystemReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getAllByText("Local Discovery").length).toBeGreaterThan(0);
    expect(
      within(panel).getByText(/Browser JSON import: local-plugin-fixtures.json/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Files scanned: 1")).toBeInTheDocument();
    expect(within(panel).getByText("Skipped entries: 1")).toBeInTheDocument();
    expect(within(panel).getByText("Runtime: browser import only")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: /scan folder/i }));
    fireEvent.click(within(panel).getByRole("button", { name: /reset/i }));

    const importInput = within(panel).getByLabelText(
      /import plugin manifest json/i,
    ) as HTMLInputElement;
    const file = new File(["{}"], "plugin.json", { type: "application/json" });
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(importInput);

    expect(onChooseFolder).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onImportFile).toHaveBeenCalledWith(file);
  });

  it("renders signed package staging controls without runtime execution claims", () => {
    const onChooseFolder = vi.fn();
    const onConsentOperationChange = vi.fn();
    const onPackagePathChange = vi.fn();
    const onReset = vi.fn();
    const onStagePackage = vi.fn();
    const onAuditRegistry = vi.fn();
    const onProveRuntimeSandbox = vi.fn();

    render(
      <PluginSystemReadinessPanel
        packageStaging={{
          auditFailedCount: 0,
          auditPassedCount: 1,
          auditUpdatedAt: "2026-06-15T00:01:00.000Z",
          consentOperation: "stage_plugin_package:library-tags-exporter@0.3.1",
          isDesktopRuntime: false,
          message: "Signed package staging is desktop-only.",
          packagePath: "/tmp/library-tags-exporter",
          runtimeProofAllowedCount: 0,
          runtimeProofDeniedCount: 1,
          runtimeProofUpdatedAt: "2026-06-15T00:02:00.000Z",
          stagedCount: 1,
          updatedAt: "2026-06-15T00:00:00.000Z",
          onAuditRegistry,
          onChooseFolder,
          onConsentOperationChange,
          onPackagePathChange,
          onProveRuntimeSandbox,
          onReset,
          onStagePackage,
        }}
        readiness={createVerifyPluginSystemReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /plugin system readiness/i });
    expect(within(panel).getByText("Signed Package Staging")).toBeInTheDocument();
    expect(within(panel).getAllByText("1 Disabled").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Runtime: browser review only")).toBeInTheDocument();
    expect(within(panel).getByText("Ledger: 1 disabled package")).toBeInTheDocument();
    expect(within(panel).getByText(/Audit: 1 passed \/ 0 blocked/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Sandbox: 1 denied \/ 0 allowed/i)).toBeInTheDocument();
    expect(within(panel).getByText(/desktop-only/i)).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText(/signed plugin package folder/i), {
      target: { value: "/tmp/updated-plugin" },
    });
    fireEvent.change(within(panel).getByLabelText(/signed plugin package consent operation/i), {
      target: { value: "stage_plugin_package:updated-plugin@1.0.0" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: /^folder$/i }));
    fireEvent.click(within(panel).getByRole("button", { name: /stage disabled/i }));
    fireEvent.click(within(panel).getByRole("button", { name: /audit registry/i }));
    fireEvent.click(within(panel).getByRole("button", { name: /sandbox proof/i }));
    fireEvent.click(within(panel).getByRole("button", { name: /clear ledger/i }));

    expect(onPackagePathChange).toHaveBeenCalledWith("/tmp/updated-plugin");
    expect(onConsentOperationChange).toHaveBeenCalledWith(
      "stage_plugin_package:updated-plugin@1.0.0",
    );
    expect(onChooseFolder).toHaveBeenCalledTimes(1);
    expect(onStagePackage).toHaveBeenCalledTimes(1);
    expect(onAuditRegistry).toHaveBeenCalledTimes(1);
    expect(onProveRuntimeSandbox).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(panel).not.toHaveTextContent(/plugin executed|permission granted|sandbox ready/i);
  });
});
