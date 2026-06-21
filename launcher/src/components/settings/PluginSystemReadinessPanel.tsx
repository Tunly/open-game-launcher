import {
  CheckCircle2,
  FileCheck2,
  FolderOpen,
  KeyRound,
  Loader2,
  PackageCheck,
  Plug,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";

import type {
  PluginActivationPlanReviewEvidence,
  PluginDisabledRegistryAuditEvidence,
  PluginManifestReview,
  PluginMarketplaceTrustEvidence,
  PluginPermissionLedgerItem,
  PluginPolicyLedgerItem,
  PluginRuntimeSandboxProofEvidence,
  PluginSignedPackageStageEvidence,
  PluginSystemReadiness,
  PluginSystemReadinessCheck,
  PluginSystemReadinessStatus,
  PluginUpdateSigningReviewEvidence,
} from "../../lib/plugin-system-readiness";

export interface PluginSystemDiscoveryControls {
  busy?: boolean;
  discoveryPath: string | null;
  importedAt: string | null;
  isDesktopRuntime: boolean;
  message: string | null;
  scannedFileCount: number;
  skippedEntries: string[];
  sourceLabel: string;
  onChooseFolder: () => void | Promise<void>;
  onImportFile: (file: File) => void | Promise<void>;
  onReset: () => void;
}

export interface PluginSystemPackageStagingControls {
  auditBusy?: boolean;
  auditFailedCount?: number;
  auditPassedCount?: number;
  auditUpdatedAt?: string | null;
  busy?: boolean;
  consentOperation: string;
  isDesktopRuntime: boolean;
  message: string | null;
  packagePath: string;
  runtimeProofAllowedCount?: number;
  runtimeProofBusy?: boolean;
  runtimeProofDeniedCount?: number;
  runtimeProofUpdatedAt?: string | null;
  stagedCount: number;
  updatedAt: string | null;
  onChooseFolder: () => void | Promise<void>;
  onConsentOperationChange: (value: string) => void;
  onAuditRegistry?: () => void | Promise<void>;
  onPackagePathChange: (value: string) => void;
  onProveRuntimeSandbox?: () => void | Promise<void>;
  onReset: () => void;
  onStagePackage: () => void | Promise<void>;
}

export interface PluginSystemReviewControls {
  activationBusy?: boolean;
  activationConsentOperation: string;
  activationPluginId: string;
  activationVersion: string;
  isDesktopRuntime: boolean;
  marketplaceBusy?: boolean;
  marketplaceIndexPath: string;
  message: string | null;
  updateBusy?: boolean;
  updateEnvelopePath: string;
  onActivationConsentOperationChange: (value: string) => void;
  onActivationPluginIdChange: (value: string) => void;
  onActivationVersionChange: (value: string) => void;
  onChooseMarketplaceIndex: () => void | Promise<void>;
  onChooseUpdateEnvelope: () => void | Promise<void>;
  onMarketplaceIndexPathChange: (value: string) => void;
  onReviewActivationPlan: () => void | Promise<void>;
  onReviewMarketplaceIndex: () => void | Promise<void>;
  onReviewUpdateEnvelope: () => void | Promise<void>;
  onUpdateEnvelopePathChange: (value: string) => void;
}

export function PluginSystemReadinessPanel({
  discovery,
  packageStaging,
  readiness,
  reviews,
}: {
  discovery?: PluginSystemDiscoveryControls;
  packageStaging?: PluginSystemPackageStagingControls;
  readiness: PluginSystemReadiness;
  reviews?: PluginSystemReviewControls;
}) {
  return (
    <section
      aria-label="Plugin system readiness"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
              <Plug className="h-3 w-3 text-[#8cf5e4]" />
              Plugin System
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${statusBadgeClass(
                readiness.blockedCount > 0
                  ? "blocked"
                  : readiness.warningCount > 0
                    ? "warning"
                    : "ready",
              )}`}
            >
              {readiness.statusLabel}
            </span>
          </div>

          <h2 className="neo-title mt-3 text-2xl font-black uppercase leading-none text-[#171411] md:text-3xl">
            Plugin Readiness
          </h2>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-relaxed text-[#5b403f]">
            {readiness.summary}
          </p>

          <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              Next Gate
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="neo-copy max-w-xl text-[11px] font-black uppercase leading-relaxed text-[#171411]">
                {readiness.nextAction}
              </p>
              <span className="neo-title border-2 border-black bg-[#8cf5e4] px-3 py-1 text-2xl uppercase shadow-[2px_2px_0_#171411]">
                {readiness.progress}%
              </span>
            </div>
            <div className="mt-3 h-3 border-2 border-black bg-[#efe6d4]">
              <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
            </div>
          </div>

          {discovery ? (
            <PluginDiscoveryConsole
              controls={discovery}
              manifestCount={readiness.manifestReviews.length}
            />
          ) : null}
          {packageStaging ? <PluginPackageStagingConsole controls={packageStaging} /> : null}
          {reviews ? <PluginReviewConsole controls={reviews} /> : null}

          <div className="mt-4 border-2 border-black bg-[#171411] p-3 text-[#f5eedf] shadow-[3px_3px_0_#b7102a]">
            <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
              <ShieldCheck className="h-4 w-4" />
              Local Guard
            </p>
            <p className="neo-copy mt-2 border-2 border-[#f5eedf] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
              {readiness.guardCopy}
            </p>
            <div className="mt-2 grid gap-1.5">
              {readiness.guards.map((guard) => (
                <p
                  className="neo-copy border-2 border-[#f5eedf] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
                  key={guard}
                >
                  {guard}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="grid w-full min-w-0 max-w-full gap-3">
          <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-2">
            {readiness.checks.map((check) => (
              <PluginReadinessCheckCard check={check} key={check.id} />
            ))}
          </div>

          <PluginManifestLedger reviews={readiness.manifestReviews} />
          <PluginDisabledRegistryAuditLedger audit={readiness.disabledRegistryAudit} />
          <PluginRuntimeSandboxProofLedger proof={readiness.runtimeSandboxProof} />
          <PluginActivationPlanReviewLedger review={readiness.activationPlanReview} />
          <PluginUpdateSigningReviewLedger review={readiness.updateSigningReview} />
          <PluginMarketplaceTrustLedger trust={readiness.marketplaceTrust} />
          <PluginSignedPackageLedger packages={readiness.signedPackageLedger} />
          <PluginPolicyLedger ledger={readiness.policyLedger} />
          <PluginPermissionLedger ledger={readiness.permissionLedger} />
        </div>
      </div>
    </section>
  );
}

function PluginReviewConsole({ controls }: { controls: PluginSystemReviewControls }) {
  const anyBusy = Boolean(
    controls.activationBusy || controls.updateBusy || controls.marketplaceBusy,
  );

  return (
    <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            <FileCheck2 className="h-4 w-4" />
            Native Review Commands
          </p>
          <p className="neo-copy mt-2 break-words text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
            {controls.isDesktopRuntime
              ? "Review local activation plans, update envelopes, and signed marketplace indexes without downloading, installing, enabling, or executing plugin code."
              : "Browser preview keeps native plugin reviews inert; desktop app is required for local file and disabled-registry review."}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
          Review Only
        </span>
      </div>

      <div className="mt-3 grid gap-3">
        <div className="grid gap-2 border-2 border-black bg-[#efe6d4] p-2 sm:grid-cols-3">
          <label className="grid gap-1">
            <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Plugin ID
            </span>
            <input
              aria-label="Plugin activation review plugin id"
              className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              value={controls.activationPluginId}
              onChange={(event) => controls.onActivationPluginIdChange(event.currentTarget.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Version
            </span>
            <input
              aria-label="Plugin activation review version"
              className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              value={controls.activationVersion}
              onChange={(event) => controls.onActivationVersionChange(event.currentTarget.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Activation Consent
            </span>
            <input
              aria-label="Plugin activation review consent operation"
              className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              value={controls.activationConsentOperation}
              onChange={(event) =>
                controls.onActivationConsentOperationChange(event.currentTarget.value)
              }
            />
          </label>
          <button
            className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#8cf5e4] shadow-[3px_3px_0_#b7102a] transition hover:-translate-y-0.5 disabled:opacity-60 sm:col-span-3"
            disabled={anyBusy}
            type="button"
            onClick={() => void controls.onReviewActivationPlan()}
          >
            {controls.activationBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Review Activation
          </button>
        </div>

        <div className="grid gap-2 border-2 border-black bg-[#efe6d4] p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="grid gap-1">
            <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Update Envelope
            </span>
            <input
              aria-label="Plugin update envelope path"
              className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              value={controls.updateEnvelopePath}
              onChange={(event) => controls.onUpdateEnvelopePathChange(event.currentTarget.value)}
            />
          </label>
          <button
            className="neo-copy inline-flex h-10 items-center justify-center gap-2 self-end border-2 border-black bg-[#f5eedf] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
            disabled={anyBusy}
            type="button"
            onClick={() => void controls.onChooseUpdateEnvelope()}
          >
            <FolderOpen className="h-4 w-4" />
            File
          </button>
          <button
            className="neo-copy inline-flex h-10 items-center justify-center gap-2 self-end border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
            disabled={anyBusy}
            type="button"
            onClick={() => void controls.onReviewUpdateEnvelope()}
          >
            {controls.updateBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Review
          </button>
        </div>

        <div className="grid gap-2 border-2 border-black bg-[#efe6d4] p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="grid gap-1">
            <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Marketplace Index
            </span>
            <input
              aria-label="Plugin marketplace index path"
              className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              value={controls.marketplaceIndexPath}
              onChange={(event) => controls.onMarketplaceIndexPathChange(event.currentTarget.value)}
            />
          </label>
          <button
            className="neo-copy inline-flex h-10 items-center justify-center gap-2 self-end border-2 border-black bg-[#f5eedf] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
            disabled={anyBusy}
            type="button"
            onClick={() => void controls.onChooseMarketplaceIndex()}
          >
            <FolderOpen className="h-4 w-4" />
            File
          </button>
          <button
            className="neo-copy inline-flex h-10 items-center justify-center gap-2 self-end border-2 border-black bg-[#b7102a] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
            disabled={anyBusy}
            type="button"
            onClick={() => void controls.onReviewMarketplaceIndex()}
          >
            {controls.marketplaceBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Review
          </button>
        </div>
      </div>

      {controls.message ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase leading-relaxed text-[#f5eedf] shadow-[2px_2px_0_#b7102a]">
          {controls.message}
        </p>
      ) : null}
    </div>
  );
}

function PluginPackageStagingConsole({
  controls,
}: {
  controls: PluginSystemPackageStagingControls;
}) {
  return (
    <div className="mt-4 border-2 border-black bg-[#8cf5e4] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411]">
            <PackageCheck className="h-4 w-4" />
            Signed Package Staging
          </p>
          <p className="neo-copy mt-2 break-words text-[10px] font-black uppercase leading-relaxed text-[#171411]">
            {controls.isDesktopRuntime
              ? "Desktop command validates hashes, signatures, and path containment before writing disabled registry evidence."
              : "Browser preview keeps signed package staging inert; desktop app is required for validation and disabled registry writes."}
          </p>
        </div>
        <span className="neo-title border-2 border-black bg-[#fff9ed] px-3 py-1 text-xl uppercase shadow-[2px_2px_0_#171411]">
          {controls.stagedCount} Disabled
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1">
          <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
            Package Folder
          </span>
          <input
            aria-label="Signed plugin package folder"
            className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
            value={controls.packagePath}
            onChange={(event) => controls.onPackagePathChange(event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#171411]">
            Consent Operation
          </span>
          <input
            aria-label="Signed plugin package consent operation"
            className="neo-copy min-h-10 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
            value={controls.consentOperation}
            onChange={(event) => controls.onConsentOperationChange(event.currentTarget.value)}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#f5eedf] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={controls.busy}
          type="button"
          onClick={() => void controls.onChooseFolder()}
        >
          {controls.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          Folder
        </button>
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={controls.busy}
          type="button"
          onClick={() => void controls.onStagePackage()}
        >
          {controls.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Stage Disabled
        </button>
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#f5eedf] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:opacity-60"
          disabled={controls.auditBusy || controls.busy}
          type="button"
          onClick={() => void controls.onAuditRegistry?.()}
        >
          {controls.auditBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Audit Registry
        </button>
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#8cf5e4] shadow-[3px_3px_0_#b7102a] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={controls.runtimeProofBusy || controls.auditBusy || controls.busy}
          type="button"
          onClick={() => void controls.onProveRuntimeSandbox?.()}
        >
          {controls.runtimeProofBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Sandbox Proof
        </button>
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] hover:text-white"
          type="button"
          onClick={controls.onReset}
        >
          <RotateCcw className="h-4 w-4" />
          Clear Ledger
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Runtime: {controls.isDesktopRuntime ? "desktop staging ready" : "browser review only"}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Ledger: {controls.stagedCount} disabled package
          {controls.stagedCount === 1 ? "" : "s"}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Updated: {controls.updatedAt ?? "not staged"}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Audit: {controls.auditPassedCount ?? 0} passed / {controls.auditFailedCount ?? 0} blocked
          {controls.auditUpdatedAt ? ` // ${controls.auditUpdatedAt}` : ""}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Sandbox: {controls.runtimeProofDeniedCount ?? 0} denied /{" "}
          {controls.runtimeProofAllowedCount ?? 0} allowed
          {controls.runtimeProofUpdatedAt ? ` // ${controls.runtimeProofUpdatedAt}` : ""}
        </p>
      </div>

      {controls.message ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase leading-relaxed text-[#f5eedf] shadow-[2px_2px_0_#b7102a]">
          {controls.message}
        </p>
      ) : null}
    </div>
  );
}

function PluginActivationPlanReviewLedger({
  review,
}: {
  review: PluginActivationPlanReviewEvidence | null;
}) {
  const checks = review?.checks ?? [];

  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <ShieldCheck className="h-4 w-4" />
          Local Activation Plan Review
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {review ? review.status : "not reviewed"}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        Activation review re-audits the disabled registry and proves the package remains blocked: no
        download, install, permission grant, network, process boundary, or code execution is allowed
        from this panel.
      </p>
      {review ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Code Executed: {String(review.codeExecuted)}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Download: {review.downloadAttempted ? "attempted" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Install: {review.installApplied ? "applied" : "blocked"}
            </p>
          </div>
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {review.sourceLabel} // {review.pluginId} // {review.version} // {review.reviewedAt}
          </p>
          <p className="neo-copy break-all border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {review.manifestHash || "no manifest hash for missing/untrusted package"}
          </p>
          {checks.map((check) => (
            <article
              className="min-w-0 border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={check.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="neo-copy break-words text-[9px] font-black uppercase text-[#171411]">
                  {check.label}
                </p>
                <span
                  className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
                    check.status === "pass"
                      ? "ready"
                      : check.status === "warning"
                        ? "warning"
                        : "blocked",
                  )}`}
                >
                  {check.status}
                </span>
              </div>
              <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                {check.detail}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No local activation plan has been reviewed. Plugin enablement, network access,
          permissions, and runtime execution remain blocked.
        </p>
      )}
    </div>
  );
}

function PluginMarketplaceTrustLedger({ trust }: { trust: PluginMarketplaceTrustEvidence | null }) {
  const entries = trust?.entries ?? [];

  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <ShieldCheck className="h-4 w-4" />
          Local Marketplace Index Trust
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {trust
            ? `${trust.catalogEntryCount} signed / ${trust.matchedDisabledPackageCount} matched`
            : "not reviewed"}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        Signed marketplace/update indexes are reviewed against disabled registry evidence only;
        marketplace downloads, installs, auto-updates, permission grants, and runtime execution
        remain blocked.
      </p>
      {trust ? (
        <div className="mt-3 grid gap-2">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Signature: {trust.signatureVerified ? "verified" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Downloads: {trust.downloadAllowed ? "open" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Installs: {trust.installAllowed ? "open" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Auto Updates: {trust.autoUpdateAllowed ? "open" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Revoked: {trust.revokedCount}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Blocked Rows: {trust.blockedCount}
            </p>
          </div>
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {trust.sourceLabel} // key {trust.signatureKeyId} // {trust.signatureIssuer} //{" "}
            {trust.reviewedAt}
          </p>
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            Index: {trust.indexPath} // Registry: {trust.registryPath}
          </p>
          {entries.map((item) => (
            <article
              className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={`${item.pluginId}-${item.version}-${item.status}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="neo-copy break-words text-[10px] font-black uppercase text-[#171411]">
                    {item.pluginId} // {item.version}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    {item.moderationStatus} // {item.channel} // {item.registryStatus} // revoked{" "}
                    {String(item.revoked)}
                  </p>
                </div>
                <span
                  className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
                    item.status === "trusted-disabled-match" && !item.revoked ? "ready" : "blocked",
                  )}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="neo-copy mt-2 break-all border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                {item.manifestHash}
              </p>
              {item.issues.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {item.issues.map((issue) => (
                    <p
                      className="neo-copy border-2 border-black bg-[#fff1c7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                      key={issue}
                    >
                      {issue}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                  Trust lane only: signed index matched a disabled package; catalog fetch, package
                  download, install, enablement, auto-update, and code load remain blocked.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No local signed marketplace/update index trust packet is staged. Marketplace connection,
          package download, install, auto-update, and plugin execution remain blocked.
        </p>
      )}
    </div>
  );
}

function PluginUpdateSigningReviewLedger({
  review,
}: {
  review: PluginUpdateSigningReviewEvidence | null;
}) {
  const entries = review?.entries ?? [];

  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <KeyRound className="h-4 w-4" />
          Local Update Signing Review
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {review
            ? `${review.signatureVerifiedCount} signed / install ${
                review.autoInstallBlocked ? "blocked" : "open"
              }`
            : "not reviewed"}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        Update envelopes are reviewed for signed manifest hashes and rollback metadata only; no
        package is downloaded, installed, enabled, or auto-updated from this ledger.
      </p>
      {review ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Manifest Hash: {review.manifestHashReady ? "ready" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Rollback Plan: {review.rollbackPlanReady ? "ready" : "blocked"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Auto Install: {review.autoInstallBlocked ? "blocked" : "open"}
            </p>
          </div>
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {review.sourceLabel} // {review.reviewedAt}
          </p>
          {entries.map((item) => (
            <article
              className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={`${item.pluginId}-${item.currentVersion}-${item.proposedVersion}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="neo-copy break-words text-[10px] font-black uppercase text-[#171411]">
                    {item.pluginId} // {item.currentVersion} -&gt; {item.proposedVersion}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    {item.channel} // {item.signatureIssuer} // rollback{" "}
                    {item.rollbackVersion ?? "missing"}
                  </p>
                </div>
                <span
                  className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
                    item.status === "review-only" && !item.autoInstall ? "ready" : "blocked",
                  )}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="neo-copy mt-2 break-words border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                {item.manifestHash}
              </p>
              {item.issues.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {item.issues.map((issue) => (
                    <p
                      className="neo-copy border-2 border-black bg-[#fff1c7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                      key={issue}
                    >
                      {issue}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                  Review lane only: auto install false; package download, enablement, and runtime
                  execution remain blocked.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No local update signing review envelope is staged. Plugin updates and auto-install remain
          blocked.
        </p>
      )}
    </div>
  );
}

function PluginRuntimeSandboxProofLedger({
  proof,
}: {
  proof: PluginRuntimeSandboxProofEvidence | null;
}) {
  const entries = proof?.entries ?? [];
  const escapeAttempts = proof?.escapeAttempts ?? [];
  const isProcessProof = Boolean(
    proof?.processBoundaryReady &&
    proof.ipcAllowlistReady === true &&
    proof.permissionGrantReady === false,
  );

  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <ShieldCheck className="h-4 w-4" />
          {isProcessProof
            ? "Native Runtime Sandbox Process Proof"
            : "Native Runtime Sandbox Dry-Run"}
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {proof
            ? `${proof.deniedEntrypointCount} denied / ${proof.allowedExecutionCount} allowed`
            : "not run"}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {isProcessProof
          ? "Owned process boundary is proved for the local admission lane: disabled registry entries are re-audited, entrypoints remain blocked, deny-all IPC is enforced, permissions stay denied, and codeExecuted false."
          : "Process Boundary proof is an admission dry-run only: disabled registry entries are re-audited, entrypoints and escape fixtures are denied before code load, permissions stay denied, and codeExecuted false."}
      </p>
      {proof ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Process Boundary: {proof.processBoundaryReady ? "ready" : "not production-ready"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              IPC Allowlist: {proof.ipcAllowlistReady ? "deny-all proof" : "deny all"}
            </p>
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Permission Grants: {proof.permissionGrantReady ? "ready" : "none"}
            </p>
          </div>
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {proof.sourceLabel} // {proof.registryPath} // {proof.provedAt} // codeExecuted{" "}
            {String(proof.codeExecuted)}
          </p>
          <div className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                Escape Fixture Matrix
              </p>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                {escapeAttempts.length} blocked
              </span>
            </div>
            <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
              Deterministic local fixtures cover path traversal, symlink entrypoints, nested
              manifest escapes, deny-all IPC, blocked network IPC, environment reads, filesystem
              writes, and permission escalation; each payload is blocked before code load.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {escapeAttempts.map((attempt) => (
                <article
                  className="min-w-0 border-2 border-black bg-[#fff9ed] p-2"
                  key={attempt.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="neo-copy break-words text-[9px] font-black uppercase text-[#171411]">
                      {attempt.label}
                    </p>
                    <span className="neo-copy border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                      {attempt.boundary}
                    </span>
                  </div>
                  <p className="neo-copy mt-2 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    Payload: {attempt.payload}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    Blocked by: {attempt.blockedBy}
                  </p>
                  <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                    Result: {attempt.result}
                  </p>
                </article>
              ))}
            </div>
          </div>
          {entries.map((item) => (
            <article
              className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={`${item.pluginId}-${item.version}-${item.status}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="neo-copy break-words text-[10px] font-black uppercase text-[#171411]">
                    {item.pluginId} // {item.version}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    {item.entrypoint} // {item.denyReason}
                  </p>
                </div>
                <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
                  {item.status}
                </span>
              </div>
              <p className="neo-copy mt-2 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                Registry: {item.registryPath}
              </p>
              {item.issues.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {item.issues.map((issue) => (
                    <p
                      className="neo-copy border-2 border-black bg-[#fff1c7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                      key={issue}
                    >
                      {issue}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                  Runtime admission: entrypoint denied before code load; staged package remains
                  disabled.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No native runtime sandbox dry-run proof has been run. Runtime admission remains blocked.
        </p>
      )}
    </div>
  );
}

function PluginDisabledRegistryAuditLedger({
  audit,
}: {
  audit: PluginDisabledRegistryAuditEvidence | null;
}) {
  const entries = audit?.entries ?? [];

  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <ShieldCheck className="h-4 w-4" />
          Native Disabled Registry Audit
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {audit ? `${audit.passedCount} passed / ${audit.failedCount} blocked` : "not run"}
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        Desktop audit re-read the disabled registry for stage-record status, hashes, signature, path
        containment, and symlink rejection without executing plugin code.
      </p>
      {audit ? (
        <div className="mt-3 grid gap-2">
          <p className="neo-copy break-words border-2 border-black bg-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {audit.sourceLabel} // {audit.registryPath} // {audit.auditedAt}
          </p>
          {entries.map((item) => (
            <article
              className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={`${item.pluginId}-${item.version}-${item.status}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="neo-copy break-words text-[10px] font-black uppercase text-[#171411]">
                    {item.pluginId} // {item.version}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    Key {item.keyId} // {item.signatureIssuer} // {item.fileCount} file
                    {item.fileCount === 1 ? "" : "s"} // {item.entrypoint}
                  </p>
                </div>
                <span
                  className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
                    item.status === "disabled-audited" ? "ready" : "blocked",
                  )}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="neo-copy mt-2 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                Registry: {item.registryPath}
              </p>
              {item.issues.length > 0 ? (
                <div className="mt-2 grid gap-1">
                  {item.issues.map((issue) => (
                    <p
                      className="neo-copy border-2 border-black bg-[#fff1c7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
                      key={issue}
                    >
                      {issue}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                  Native local audit: disabled status, package hashes, Ed25519 signature, and path
                  containment verified; codeExecuted false.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No native disabled registry audit has been run. Browser package rows remain display cache.
        </p>
      )}
    </div>
  );
}

function PluginSignedPackageLedger({ packages }: { packages: PluginSignedPackageStageEvidence[] }) {
  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-center justify-between gap-3">
        <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          <KeyRound className="h-4 w-4" />
          Browser Display Cache
        </p>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {packages.length} Disabled
        </span>
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        Browser localStorage only reopens this display ledger; native disabled registry audit is
        required for package trust.
      </p>
      {packages.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {packages.map((item) => (
            <article
              className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
              key={`${item.pluginId}-${item.version}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="neo-copy break-words text-[10px] font-black uppercase text-[#171411]">
                    {item.pluginId} // {item.version}
                  </p>
                  <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                    Key {item.keyId} // {item.signatureIssuer} // {item.fileCount} file
                    {item.fileCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                  {item.status}
                </span>
              </div>
              <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
                {item.detail}
              </p>
              <p className="neo-copy mt-2 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                Registry: {item.registryPath}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
          No signed plugin package has been staged into the disabled registry.
        </p>
      )}
    </div>
  );
}

function PluginDiscoveryConsole({
  controls,
  manifestCount,
}: {
  controls: PluginSystemDiscoveryControls;
  manifestCount: number;
}) {
  return (
    <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            <FolderOpen className="h-4 w-4" />
            Local Discovery
          </p>
          <p className="neo-copy mt-2 break-words text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
            {controls.discoveryPath
              ? `${controls.sourceLabel}: ${controls.discoveryPath}`
              : controls.isDesktopRuntime
                ? "Choose a plugin folder or import manifest JSON for local review."
                : "Browser preview can import JSON; desktop app can scan plugin folders."}
          </p>
          {controls.importedAt ? (
            <p className="neo-copy mt-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
              Loaded {controls.importedAt}
            </p>
          ) : null}
        </div>
        <span className="neo-title border-2 border-black bg-[#8cf5e4] px-3 py-1 text-xl uppercase shadow-[2px_2px_0_#171411]">
          {manifestCount} Manifests
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={controls.busy}
          type="button"
          onClick={() => void controls.onChooseFolder()}
        >
          {controls.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          Scan Folder
        </button>
        <label className="neo-copy inline-flex h-10 cursor-pointer items-center justify-center gap-2 border-2 border-black bg-[#f5eedf] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]">
          <Upload className="h-4 w-4" />
          Import JSON
          <input
            accept="application/json,.json"
            aria-label="Import plugin manifest JSON"
            className="sr-only"
            type="file"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              void Promise.resolve(controls.onImportFile(file)).finally(() => {
                input.value = "";
              });
            }}
          />
        </label>
        <button
          className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] hover:text-white"
          type="button"
          onClick={controls.onReset}
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Files scanned: {controls.scannedFileCount}
        </p>
        <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Skipped entries: {controls.skippedEntries.length}
        </p>
        <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          Runtime: {controls.isDesktopRuntime ? "desktop scan ready" : "browser import only"}
        </p>
      </div>

      {controls.message ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#087d6d] px-2 py-1 text-[9px] font-black uppercase leading-relaxed text-white shadow-[2px_2px_0_#171411]">
          {controls.message}
        </p>
      ) : null}

      {controls.skippedEntries.length > 0 ? (
        <div className="mt-3 grid gap-1">
          {controls.skippedEntries.slice(0, 4).map((entry) => (
            <p
              className="neo-copy min-w-0 break-words border-2 border-black bg-[#fff1c7] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]"
              key={entry}
            >
              {entry}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PluginReadinessCheckCard({ check }: { check: PluginSystemReadinessCheck }) {
  const StatusIcon = check.status === "ready" ? CheckCircle2 : TriangleAlert;

  return (
    <article className="min-w-0 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="neo-copy text-[11px] font-black uppercase text-[#171411]">
            {check.label}
          </h3>
          <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-snug text-[#5b403f]">
            {check.detail}
          </p>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
            check.status,
          )}`}
        >
          <StatusIcon className="h-3 w-3" />
          {check.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        {check.action}
      </p>
    </article>
  );
}

function statusBadgeClass(status: PluginSystemReadinessStatus) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function PluginManifestLedger({ reviews }: { reviews: PluginManifestReview[] }) {
  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="neo-copy flex items-center gap-2 text-[11px] font-black uppercase text-[#171411]">
          <FileCheck2 className="h-4 w-4 text-[#087d6d]" />
          Manifest Ledger
        </h3>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411]">
          {reviews.length} staged
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {reviews.length > 0 ? (
          reviews.map((review) => <PluginManifestReviewCard key={review.id} review={review} />)
        ) : (
          <p className="neo-copy border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
            No local plugin manifests are staged for review.
          </p>
        )}
      </div>
    </div>
  );
}

function PluginManifestReviewCard({ review }: { review: PluginManifestReview }) {
  const StatusIcon = review.status === "ready" ? CheckCircle2 : TriangleAlert;

  return (
    <article className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black uppercase text-[#171411]">{review.name}</p>
          <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
            {review.id} // v{review.version} // {review.entrypoint}
          </p>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusBadgeClass(
            review.status,
          )}`}
        >
          <StatusIcon className="h-3 w-3" />
          {review.statusLabel}
        </span>
      </div>

      <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        {review.detail}
      </p>

      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {review.reviewItems.map((item) => (
          <span
            className="neo-copy min-w-0 break-words border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
      <div className="mt-2 grid gap-1">
        {review.policyItems.map((item) => (
          <span
            className="neo-copy min-w-0 break-words border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#f5eedf]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </article>
  );
}

function PluginPolicyLedger({ ledger }: { ledger: PluginPolicyLedgerItem[] }) {
  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <h3 className="neo-copy flex items-center gap-2 text-[11px] font-black uppercase text-[#171411]">
        <ShieldCheck className="h-4 w-4 text-[#087d6d]" />
        Policy Ledger
      </h3>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ledger.map((item) => (
          <article
            className="min-w-0 max-w-full border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]"
            key={item.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="neo-copy break-words text-[9px] font-black uppercase text-[#171411]">
                {item.label}
              </p>
              <span
                className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusBadgeClass(
                  item.status,
                )}`}
              >
                {item.status}
              </span>
            </div>
            <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function PluginPermissionLedger({ ledger }: { ledger: PluginPermissionLedgerItem[] }) {
  return (
    <div className="min-w-0 max-w-full border-2 border-black bg-[#171411] p-3 text-[#f5eedf] shadow-[3px_3px_0_#b7102a]">
      <h3 className="neo-copy flex items-center gap-2 text-[11px] font-black uppercase text-[#8cf5e4]">
        <KeyRound className="h-4 w-4" />
        Permission Ledger
      </h3>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ledger.map((item) => (
          <article
            className="border-2 border-[#f5eedf] bg-[#2a221b] p-2 shadow-[2px_2px_0_#b7102a]"
            key={item.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="neo-copy break-words text-[9px] font-black uppercase text-[#f5eedf]">
                {item.label}
              </p>
              <span
                className={`neo-copy border-2 border-[#f5eedf] px-2 py-1 text-[8px] font-black uppercase ${statusBadgeClass(
                  item.status,
                )}`}
              >
                {item.count}
              </span>
            </div>
            <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#f5eedf]">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
