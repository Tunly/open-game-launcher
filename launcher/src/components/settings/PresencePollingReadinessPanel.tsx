import { useCallback, useEffect, useMemo, useState } from "react";
import { RadioTower, RefreshCw, ShieldCheck } from "lucide-react";

import {
  getPresencePollingReadiness,
  type PresenceHostedCronStagingEvidence,
  type PresencePollDryRunEvidenceRow,
  type PresenceProviderBridgeContractRow,
  type PresencePollingReadinessCheck,
  type PresencePollingReadinessStatus,
  type PresenceReadinessPlatformAccount,
  type PresenceReadinessUserPresence,
} from "../../lib/presence-readiness";
import { getMyPlatformAccounts } from "../../lib/supabase/platform-accounts";
import {
  getLatestPresencePollRunEvidence,
  getMyPresence,
  isTrustedPresencePollRunEvidence,
  type PresencePollRunEvidence,
} from "../../lib/supabase/presence";
import type { PlatformType } from "../../lib/types/friends";

interface PresencePollingReadinessPanelProps {
  connectedPlatforms?: Partial<Record<PlatformType, boolean>>;
  evidenceError?: string | null;
  hostedCronStaging?: PresenceHostedCronStagingEvidence | null;
  now?: Date | number | string;
  ownPresence?: PresenceReadinessUserPresence | null;
  platformAccounts?: PresenceReadinessPlatformAccount[];
  supabaseConfigured: boolean;
  trustedEvidence?: boolean;
}

function statusClass(status: PresencePollingReadinessStatus) {
  if (status === "pass") return "bg-[#087d6d] text-white";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#fff9ed] text-[#171411]";
}

function readinessClass(statusLabel: string) {
  if (statusLabel === "Ready") return "bg-[#087d6d] text-white";
  if (statusLabel === "Blocked") return "bg-[#b7102a] text-white";
  return "bg-[#fff9ed] text-[#171411]";
}

export function PresencePollingReadinessPanel({
  connectedPlatforms = {},
  evidenceError,
  hostedCronStaging,
  now,
  ownPresence,
  platformAccounts,
  supabaseConfigured,
  trustedEvidence,
}: PresencePollingReadinessPanelProps) {
  const hasInjectedEvidence =
    platformAccounts !== undefined ||
    ownPresence !== undefined ||
    evidenceError !== undefined ||
    trustedEvidence !== undefined;
  const [currentNow, setCurrentNow] = useState(() => Date.now());
  const [evidenceState, setEvidenceState] = useState<{
    error: string | null;
    loading: boolean;
    ownPresence: PresenceReadinessUserPresence | null;
    platformAccounts: PresenceReadinessPlatformAccount[];
    trustedRunEvidence: PresencePollRunEvidence | null;
  }>({
    error: null,
    loading: supabaseConfigured && !hasInjectedEvidence,
    ownPresence: null,
    platformAccounts: [],
    trustedRunEvidence: null,
  });

  const loadEvidence = useCallback(async () => {
    if (!supabaseConfigured) {
      setEvidenceState({
        error: null,
        loading: false,
        ownPresence: null,
        platformAccounts: [],
        trustedRunEvidence: null,
      });
      return;
    }

    setEvidenceState((current) => ({ ...current, loading: true }));
    try {
      const [accounts, presence, trustedRunEvidence] = await Promise.all([
        getMyPlatformAccounts(),
        getMyPresence(),
        getLatestPresencePollRunEvidence(),
      ]);
      setEvidenceState({
        error: null,
        loading: false,
        ownPresence: presence,
        platformAccounts: accounts,
        trustedRunEvidence,
      });
    } catch (error) {
      setEvidenceState({
        error:
          error instanceof Error ? error.message : "Presence polling evidence could not be loaded.",
        loading: false,
        ownPresence: null,
        platformAccounts: [],
        trustedRunEvidence: null,
      });
    }
  }, [supabaseConfigured]);

  useEffect(() => {
    if (now !== undefined) return;
    const interval = window.setInterval(() => setCurrentNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [now]);

  useEffect(() => {
    if (hasInjectedEvidence) return;
    void loadEvidence();
  }, [hasInjectedEvidence, loadEvidence]);

  const effectivePlatformAccounts = platformAccounts ?? evidenceState.platformAccounts;
  const effectiveOwnPresence = ownPresence !== undefined ? ownPresence : evidenceState.ownPresence;
  const effectiveEvidenceError = evidenceError !== undefined ? evidenceError : evidenceState.error;
  const effectiveTrustedEvidence =
    trustedEvidence ??
    isTrustedPresencePollRunEvidence(evidenceState.trustedRunEvidence, now ?? currentNow);
  const readiness = useMemo(
    () =>
      getPresencePollingReadiness({
        connectedPlatforms,
        evidenceError: effectiveEvidenceError,
        hostedCronStaging,
        now: now ?? currentNow,
        ownPresence: effectiveOwnPresence,
        platformAccounts: effectivePlatformAccounts,
        supabaseConfigured,
        trustedEvidence: effectiveTrustedEvidence,
      }),
    [
      connectedPlatforms,
      currentNow,
      effectiveEvidenceError,
      effectiveOwnPresence,
      effectivePlatformAccounts,
      effectiveTrustedEvidence,
      hostedCronStaging,
      now,
      supabaseConfigured,
    ],
  );

  return (
    <section
      aria-label="Presence polling readiness"
      className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black p-5">
        <div>
          <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
            Realtime Presence
          </p>
          <h2 className="text-3xl font-black text-[#171411] uppercase">
            Presence Polling Readiness
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Refresh presence readiness evidence"
            className="border-2 border-black bg-[#8cf5e4] p-2 text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58]"
            disabled={!supabaseConfigured || evidenceState.loading || hasInjectedEvidence}
            type="button"
            onClick={() => void loadEvidence()}
          >
            <RefreshCw
              className={`h-4 w-4 ${evidenceState.loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <span
            className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${readinessClass(
              readiness.statusLabel,
            )}`}
          >
            {readiness.statusLabel}
          </span>
          <RadioTower className="h-10 w-10 text-[#c20b2f]" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="neo-copy border-2 border-black bg-[#efe6d4] p-3 text-[10px] leading-relaxed font-black text-[#55504a] uppercase shadow-[2px_2px_0_#171411]">
          {readiness.summary}
        </p>
        {evidenceState.loading ? (
          <p className="neo-copy border-2 border-black bg-[#fff9ed] p-2 text-[9px] font-black tracking-[0.08em] text-[#171411] uppercase">
            Loading latest poll evidence...
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <PresenceReadinessMetric label="Progress" value={`${readiness.progress}%`} />
          <PresenceReadinessMetric label="Passed" value={String(readiness.passedCount)} />
          <PresenceReadinessMetric label="Warnings" value={String(readiness.warningCount)} />
          <PresenceReadinessMetric
            label="Linked"
            value={String(readiness.connectedPlatformCount)}
          />
          <PresenceReadinessMetric
            label="Poll OK"
            value={`${readiness.bridgeCoverageCount}/${readiness.connectedPlatformCount}`}
          />
          <PresenceReadinessMetric label="Dry-run" value={String(readiness.dryRunEvidenceCount)} />
        </div>

        {readiness.hostedCronStaging ? (
          <PresenceHostedCronStagingPacket evidence={readiness.hostedCronStaging} />
        ) : null}

        <PresenceDryRunEvidenceLedger rows={readiness.dryRunEvidence} />

        <PresenceProviderBridgeMatrix
          readyCount={readiness.providerBridgeReadyCount}
          rows={readiness.providerBridgeContracts}
          totalCount={readiness.providerBridgeContractCount}
        />

        <div className="grid gap-2 md:grid-cols-2">
          {readiness.checks.map((check) => (
            <PresenceReadinessCheckCard key={check.label} check={check} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PresenceHostedCronStagingPacket({
  evidence,
}: {
  evidence: PresenceHostedCronStagingEvidence;
}) {
  return (
    <div
      aria-label="Presence hosted cron staging"
      className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
            Hosted Cron Staging Packet
          </p>
          <p className="neo-copy mt-1 text-[9px] leading-relaxed font-black text-[#55504a] uppercase">
            Manual deploy-gate evidence stages poll-platform-presence before scheduler handoff. It
            does not claim a live scheduled run, provider bridge execution, user_presence writeback,
            or activity inserts.
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411] ${statusClass(
            evidence.status,
          )}`}
        >
          {evidence.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <PresenceStagingLine label="Workflow" value={evidence.workflow} />
        <PresenceStagingLine label="Environment" value={evidence.environment} />
        <PresenceStagingLine label="Function" value={evidence.functionName} />
        <PresenceStagingLine label="Secret" value={evidence.secretEnv} />
        <PresenceStagingLine label="Reviewed" value={evidence.reviewedAt} />
        <PresenceStagingLine label="Cadence" value={evidence.schedulerCadence} />
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <PresenceStagingBlock label="Dry-run smoke" value={evidence.dryRunPayload} />
        <PresenceStagingBlock label="Scheduler handoff" value={evidence.schedulerPayload} />
      </div>

      <div className="mt-2 grid gap-1.5 md:grid-cols-3">
        {evidence.expectedNoWriteKeys.map((key) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-relaxed font-black text-[#55504a] uppercase"
            key={key}
          >
            {key}
          </p>
        ))}
      </div>

      <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-relaxed font-black text-[#55504a] uppercase">
        Runbook: {evidence.runbookPath}
      </p>
    </div>
  );
}

function PresenceStagingLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
      {label}: {value}
    </p>
  );
}

function PresenceStagingBlock({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
      {label}: {value}
    </p>
  );
}

function PresenceProviderBridgeMatrix({
  readyCount,
  rows,
  totalCount,
}: {
  readyCount: number;
  rows: PresenceProviderBridgeContractRow[];
  totalCount: number;
}) {
  return (
    <div
      aria-label="Presence provider bridge matrix"
      className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
            Provider Bridge Contract Matrix
          </p>
          <p className="neo-copy mt-1 text-[9px] leading-relaxed font-black text-[#55504a] uppercase">
            Local request/response fixtures review Epic, GOG, EA, Xbox, Battle.net, and Ubisoft
            bridge boundaries. No live provider coverage, user_presence writeback, activity insert,
            or token exposure is claimed.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
          {readyCount}/{totalCount} staged
        </span>
      </div>

      <div className="mt-3 overflow-x-auto border-2 border-black bg-[#fbf4e7]">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead className="bg-[#171411] text-[#fff9ed]">
            <tr>
              {["Platform", "Request", "Response", "Evidence", "Token", "Result"].map((label) => (
                <th
                  className="neo-copy border-r-2 border-[#fff9ed] px-2 py-2 text-[8px] font-black tracking-[0.12em] uppercase last:border-r-0"
                  key={label}
                  scope="col"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => <PresenceProviderBridgeMatrixRow key={row.platform} row={row} />)
            ) : (
              <tr>
                <td
                  className="neo-copy px-2 py-3 text-[9px] leading-relaxed font-black text-[#55504a] uppercase"
                  colSpan={6}
                >
                  No non-Steam provider bridge contract fixtures staged.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresenceProviderBridgeMatrixRow({ row }: { row: PresenceProviderBridgeContractRow }) {
  return (
    <tr className="border-t-2 border-black">
      <td className="neo-copy border-r-2 border-black px-2 py-2 text-[9px] font-black text-[#171411] uppercase">
        {row.platform}
      </td>
      <td className="neo-copy border-r-2 border-black px-2 py-2 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
        {row.requestShape}
      </td>
      <td className="neo-copy border-r-2 border-black px-2 py-2 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
        {row.responseShape}
      </td>
      <td className="neo-copy border-r-2 border-black px-2 py-2 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
        {row.evidence}
      </td>
      <td className="neo-copy border-r-2 border-black px-2 py-2 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
        {row.tokenHandling}
      </td>
      <td className="px-2 py-2">
        <span
          className={`neo-copy inline-block border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass(
            row.status,
          )}`}
        >
          {row.status}
        </span>
      </td>
    </tr>
  );
}

function PresenceDryRunEvidenceLedger({ rows }: { rows: PresencePollDryRunEvidenceRow[] }) {
  return (
    <div
      aria-label="Presence trusted dry-run review"
      className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
            Trusted Dry-Run Review
          </p>
          <p className="neo-copy mt-1 text-[9px] leading-relaxed font-black text-[#55504a] uppercase">
            Secret-gated dry-run packets can be reviewed before hosted cron writes. They do not
            claim user_presence writeback, activity inserts, or live provider coverage.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
          Review only
        </span>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {rows.length > 0 ? (
          rows.map((row) => <PresenceDryRunEvidenceCard key={row.runId} row={row} />)
        ) : (
          <p className="neo-copy border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] leading-relaxed font-black text-[#55504a] uppercase">
            No trusted dry-run packet staged.
          </p>
        )}
      </div>
    </div>
  );
}

function PresenceDryRunEvidenceCard({ row }: { row: PresencePollDryRunEvidenceRow }) {
  return (
    <article className="border-2 border-black bg-[#efe6d4] p-2 shadow-[1px_1px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#171411] uppercase">
          {row.platform} // {row.writeMode}
        </p>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
          {row.runId}
        </span>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <PresenceDryRunLine label="Source" value={row.source} />
        <PresenceDryRunLine label="Status" value={row.reason ?? row.status ?? "unknown"} />
        <PresenceDryRunLine label="Fetched" value={row.fetchedAt ?? "missing"} />
        <PresenceDryRunLine label="Writes" value="none" />
      </div>
    </article>
  );
}

function PresenceDryRunLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[8px] leading-relaxed font-black [overflow-wrap:anywhere] text-[#55504a] uppercase">
      {label}: {value}
    </p>
  );
}

function PresenceReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fbf4e7] p-3 shadow-[2px_2px_0_#171411]">
      <span className="neo-copy block text-[9px] font-black text-[#55504a] uppercase">{label}</span>
      <strong className="mt-1 block text-2xl font-black text-[#171411] uppercase">{value}</strong>
    </div>
  );
}

function PresenceReadinessCheckCard({ check }: { check: PresencePollingReadinessCheck }) {
  return (
    <article className="border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm leading-none font-black text-[#171411] uppercase">{check.label}</h3>
        <span
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass(
            check.status,
          )}`}
        >
          {check.status}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[9px] leading-relaxed font-black text-[#55504a] uppercase">
        {check.detail}
      </p>
      {check.status === "pass" ? (
        <ShieldCheck className="mt-3 h-4 w-4 text-[#087d6d]" aria-hidden="true" />
      ) : null}
    </article>
  );
}
