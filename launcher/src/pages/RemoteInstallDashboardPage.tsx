import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  HardDriveDownload,
  Link as LinkIcon,
  RadioTower,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RemoteHostedContractReadinessPanel } from "../components/launcher/RemoteHostedContractReadinessPanel";
import { getErrorMessage } from "../lib/formatters";
import { getRemoteCompanionCloudReadiness } from "../lib/remote-companion-cloud-readiness";
import {
  isRemoteHostedRelayDeploymentReady,
  isRemoteHostedRelayEnqueueEnabled,
} from "../lib/remote-hosted-relay-deployment";
import {
  buildRemoteInstallDeepLink,
  parseRemoteInstallHandoff,
} from "../lib/remote-install-handoff";
import {
  enqueueRemoteCompanionInstallJob,
  type RemoteInstallJobResult,
} from "../lib/supabase/remote-companion";

interface RemoteInstallDraft {
  downloadSha256: string;
  downloadUrl: string;
  gameId: string;
  installManifestSha256: string;
  installManifestUrl: string;
  title: string;
}

interface HostedRelayDraft {
  buildId: string;
  channel: string;
  companionDeviceId: string;
  platform: string;
  productId: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const shortTokenPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

export function RemoteInstallDashboardPage() {
  const [searchParams] = useSearchParams();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [hostedRelayState, setHostedRelayState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );
  const [hostedRelayResult, setHostedRelayResult] = useState<RemoteInstallJobResult | null>(null);
  const [hostedRelayError, setHostedRelayError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RemoteInstallDraft>(() => ({
    downloadSha256: searchParams.get("downloadSha256") ?? searchParams.get("sha256") ?? "",
    downloadUrl: searchParams.get("downloadUrl") ?? searchParams.get("url") ?? "",
    gameId:
      searchParams.get("gameId") ?? searchParams.get("game_id") ?? searchParams.get("id") ?? "",
    installManifestSha256:
      searchParams.get("installManifestSha256") ??
      searchParams.get("manifestSha256") ??
      searchParams.get("manifest_sha256") ??
      "",
    installManifestUrl:
      searchParams.get("installManifestUrl") ??
      searchParams.get("manifestUrl") ??
      searchParams.get("manifest_url") ??
      "",
    title:
      searchParams.get("title") ?? searchParams.get("gameTitle") ?? searchParams.get("name") ?? "",
  }));
  const [hostedDraft, setHostedDraft] = useState<HostedRelayDraft>(() => ({
    buildId: readFirstSearchParam(searchParams, ["buildId", "build_id"]) ?? "",
    channel: searchParams.get("channel") ?? "stable",
    companionDeviceId:
      readFirstSearchParam(searchParams, [
        "companionDeviceId",
        "companion_device_id",
        "deviceId",
      ]) ?? "",
    platform: searchParams.get("platform") ?? "windows",
    productId: readFirstSearchParam(searchParams, ["productId", "product_id"]) ?? "",
  }));

  const handoffResult = useMemo(() => parseRemoteInstallHandoff(toParamRecord(draft)), [draft]);
  const deepLink =
    handoffResult.status === "valid"
      ? buildRemoteInstallDeepLink({ ...handoffResult.handoff, source: "web-dashboard" })
      : "";
  const hostedContractReadiness = useMemo(
    () =>
      getRemoteCompanionCloudReadiness({
        hasDesktopSecretVault: true,
        hasHostedDeployment: isRemoteHostedRelayDeploymentReady(searchParams.get("verify")),
        hasOpaqueJobQueue: true,
        hasPairingRpc: true,
        hasRelayFunction: true,
        hasSchemaRls: true,
        hasStoreBuildTicketContract: true,
      }),
    [searchParams],
  );
  const hostedRelayDeploymentEnabled = useMemo(() => isRemoteHostedRelayEnqueueEnabled(), []);
  const displayTitle =
    handoffResult.status === "valid"
      ? handoffResult.handoff.title || handoffResult.handoff.gameId
      : draft.title || "Remote install";
  const statusLabel =
    handoffResult.status === "valid"
      ? "Ready"
      : handoffResult.status === "invalid"
        ? "Blocked"
        : "Waiting";
  const statusClass =
    handoffResult.status === "valid"
      ? "bg-[#087d6d] text-white"
      : handoffResult.status === "invalid"
        ? "bg-[#b7102a] text-white"
        : "bg-[#fff9ed] text-[#171411]";
  const hostedRelayValidation = useMemo(
    () => validateHostedRelayDraft(draft, hostedDraft, hostedRelayDeploymentEnabled),
    [draft, hostedDraft, hostedRelayDeploymentEnabled],
  );
  const hostedRelayReady = hostedRelayValidation === null && hostedRelayState !== "sending";

  async function copyDeepLink() {
    if (!deepLink) return;

    try {
      await navigator.clipboard.writeText(deepLink);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function updateDraft(field: keyof RemoteInstallDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setCopyState("idle");
    setHostedRelayState("idle");
    setHostedRelayError(null);
  }

  function updateHostedDraft(field: keyof HostedRelayDraft, value: string) {
    setHostedDraft((current) => ({ ...current, [field]: value }));
    setHostedRelayState("idle");
    setHostedRelayError(null);
  }

  async function sendHostedRelayJob() {
    if (hostedRelayValidation) {
      setHostedRelayState("failed");
      setHostedRelayError(hostedRelayValidation);
      return;
    }

    setHostedRelayState("sending");
    setHostedRelayError(null);
    setHostedRelayResult(null);

    try {
      const result = await enqueueRemoteCompanionInstallJob({
        buildId: normalizeOptionalUuid(hostedDraft.buildId),
        companionDeviceId: hostedDraft.companionDeviceId.trim().toLowerCase(),
        gameId: draft.gameId.trim(),
        packageRef: buildHostedRelayPackageRef(hostedDraft),
        platform: normalizeShortToken(hostedDraft.platform) ?? "windows",
        productId: hostedDraft.productId.trim().toLowerCase(),
        source: "web-dashboard",
        title: (draft.title || draft.gameId).trim(),
      });

      if (!result) {
        throw new Error("Hosted relay is not deployed for this environment.");
      }

      setHostedRelayResult(result);
      setHostedRelayState("sent");
    } catch (error) {
      setHostedRelayState("failed");
      setHostedRelayError(getErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            Remote Install Web Dashboard
          </p>
          <h1 className="neo-title mt-3 max-w-[780px] text-[3.2rem] leading-[0.82] text-[#171411] sm:text-[4.2rem] lg:text-[5.1rem] xl:text-[5.8rem]">
            Remote Install
          </h1>
        </div>
        <div className="neo-dots border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#5b403f]">
            Handoff State
          </p>
          <p className="neo-title mt-1 max-w-[260px] truncate text-2xl leading-none text-[#171411]">
            {statusLabel}
          </p>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_360px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="flex items-center gap-2 border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
            <HardDriveDownload className="h-5 w-5 text-[#8cf5e4]" />
            <h2 className="neo-title text-3xl leading-none">Install Payload</h2>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <RemoteInstallField
                  label="Game ID"
                  value={draft.gameId}
                  onChange={(value) => updateDraft("gameId", value)}
                />
                <RemoteInstallField
                  label="Title"
                  value={draft.title}
                  onChange={(value) => updateDraft("title", value)}
                />
              </div>
              <RemoteInstallField
                label="Download URL"
                value={draft.downloadUrl}
                onChange={(value) => updateDraft("downloadUrl", value)}
              />
              <RemoteInstallField
                label="SHA-256"
                value={draft.downloadSha256}
                onChange={(value) => updateDraft("downloadSha256", value)}
              />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)]">
                <RemoteInstallField
                  label="Install Manifest URL"
                  value={draft.installManifestUrl}
                  onChange={(value) => updateDraft("installManifestUrl", value)}
                />
                <RemoteInstallField
                  label="Manifest SHA-256"
                  value={draft.installManifestSha256}
                  onChange={(value) => updateDraft("installManifestSha256", value)}
                />
              </div>

              <div className="border-[3px] border-black bg-[#efe6d4] p-3 shadow-[3px_3px_0_#171411]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${statusClass}`}
                  >
                    {statusLabel}
                  </span>
                  <h3 className="neo-title text-xl leading-none text-[#171411]">{displayTitle}</h3>
                </div>
                {handoffResult.status === "valid" ? (
                  <code className="block break-all border-2 border-black bg-[#fff9ed] px-3 py-2 text-[12px] font-black text-[#171411]">
                    {deepLink}
                  </code>
                ) : (
                  <p className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
                    {handoffResult.status === "invalid"
                      ? handoffResult.message
                      : "Remote install payload needs a game id."}
                  </p>
                )}
              </div>
            </div>

            <div className="card-art-drift relative min-h-[240px] overflow-hidden border-[3px] border-black shadow-[4px_4px_0_#171411]">
              <div className="absolute left-3 top-3 border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                App Relay
              </div>
              <div className="absolute bottom-3 right-3 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                Install Link
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          {deepLink ? (
            <a
              className="neo-copy flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411]"
              href={deepLink}
            >
              <ExternalLink className="h-4 w-4" />
              Open Desktop App
            </a>
          ) : (
            <button
              className="neo-copy flex w-full cursor-not-allowed items-center justify-center gap-2 border-[3px] border-black bg-[#d8cbb7] px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-[#655f58] shadow-[4px_4px_0_#171411]"
              disabled
              type="button"
            >
              <ExternalLink className="h-4 w-4" />
              Open Desktop App
            </button>
          )}
          <button
            className="neo-copy flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#007166] px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
            disabled={!deepLink}
            type="button"
            onClick={copyDeepLink}
          >
            {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copyState === "copied" ? "Copied" : "Copy Deep Link"}
          </button>
          {copyState === "failed" ? (
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#b7102a] shadow-[2px_2px_0_#171411]">
              Clipboard unavailable.
            </p>
          ) : null}
          <Link
            className="neo-copy flex items-center justify-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-[#171411] shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f6edd8] hover:shadow-[6px_6px_0_#171411]"
            to="/downloads"
          >
            <LinkIcon className="h-4 w-4" />
            Downloads
          </Link>

          <HostedRelayEnqueuePanel
            draft={hostedDraft}
            error={hostedRelayError}
            result={hostedRelayResult}
            state={hostedRelayState}
            validation={hostedRelayValidation}
            onChange={updateHostedDraft}
            onSend={sendHostedRelayJob}
            ready={hostedRelayReady}
          />

          <div className="neo-dots border-[3px] border-black bg-[#efe6d4] p-3 shadow-[4px_4px_0_#171411]">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#5b403f]">
              Accepted Schemes
            </p>
            <p className="neo-title mt-2 text-2xl leading-none text-[#171411]">HTTP / HTTPS</p>
            <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
              Provider handoffs can use known external game IDs.
            </p>
          </div>
          <RemoteHostedContractReadinessPanel readiness={hostedContractReadiness} />
        </aside>
      </section>
    </div>
  );
}

function HostedRelayEnqueuePanel({
  draft,
  error,
  onChange,
  onSend,
  ready,
  result,
  state,
  validation,
}: {
  draft: HostedRelayDraft;
  error: string | null;
  onChange: (field: keyof HostedRelayDraft, value: string) => void;
  onSend: () => void;
  ready: boolean;
  result: RemoteInstallJobResult | null;
  state: "idle" | "sending" | "sent" | "failed";
  validation: string | null;
}) {
  const statusLabel =
    state === "sent"
      ? "Queued"
      : state === "failed" || validation
        ? "Blocked"
        : state === "sending"
          ? "Sending"
          : "Ready";
  const statusClass =
    state === "sent"
      ? "bg-[#087d6d] text-white"
      : state === "failed" || validation
        ? "bg-[#b7102a] text-white"
        : state === "sending"
          ? "bg-[#8cf5e4] text-[#171411]"
          : "bg-[#fff9ed] text-[#171411]";

  return (
    <section
      aria-label="Hosted relay enqueue"
      className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
          <RadioTower className="h-3 w-3" />
          Hosted Relay
        </span>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <h2 className="neo-title mt-2 text-2xl leading-none text-[#171411]">Send Opaque Job</h2>

      <div className="mt-3 grid gap-3">
        <RemoteInstallField
          label="Companion Device ID"
          value={draft.companionDeviceId}
          onChange={(value) => onChange("companionDeviceId", value)}
        />
        <RemoteInstallField
          label="Store Product ID"
          value={draft.productId}
          onChange={(value) => onChange("productId", value)}
        />
        <RemoteInstallField
          label="Build ID"
          value={draft.buildId}
          onChange={(value) => onChange("buildId", value)}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <RemoteInstallField
            label="Platform"
            value={draft.platform}
            onChange={(value) => onChange("platform", value)}
          />
          <RemoteInstallField
            label="Channel"
            value={draft.channel}
            onChange={(value) => onChange("channel", value)}
          />
        </div>
      </div>

      <button
        className="neo-copy mt-3 flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#087d6d] px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
        disabled={!ready}
        type="button"
        onClick={onSend}
      >
        <Send className="h-4 w-4" />
        {state === "sending" ? "Sending" : "Send via Hosted Relay"}
      </button>

      {validation || error ? (
        <p className="neo-copy mt-3 flex gap-2 border-2 border-black bg-[#efe6d4] px-3 py-2 text-[10px] font-black uppercase leading-relaxed text-[#b7102a]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error ?? validation}</span>
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
          <span className="neo-copy block text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            Job Queued
          </span>
          <strong className="neo-copy mt-1 block break-all text-[11px] font-black uppercase text-[#171411]">
            {result.jobId}
          </strong>
          <span className="neo-copy mt-1 block text-[9px] font-black uppercase text-[#5b403f]">
            {result.status} // expires {formatHostedRelayExpiry(result.expiresAt)}
          </span>
        </div>
      ) : null}

      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        Package ref: store-build-ticket // raw URL fields are not sent.
      </p>
    </section>
  );
}

function RemoteInstallField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="neo-copy mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
        {label}
      </span>
      <input
        className="neo-copy h-11 w-full border-[3px] border-black bg-[#fff9ed] px-3 text-[12px] font-black text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#f5eedf]"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function toParamRecord(draft: RemoteInstallDraft): Record<string, string> {
  return {
    downloadSha256: draft.downloadSha256,
    downloadUrl: draft.downloadUrl,
    gameId: draft.gameId,
    installManifestSha256: draft.installManifestSha256,
    installManifestUrl: draft.installManifestUrl,
    title: draft.title,
  };
}

function readFirstSearchParam(searchParams: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function validateHostedRelayDraft(
  draft: RemoteInstallDraft,
  hostedDraft: HostedRelayDraft,
  hostedDeploymentReady: boolean,
) {
  if (!hostedDeploymentReady) return "Hosted relay deployment flag must be enabled before enqueue.";
  if (!draft.gameId.trim()) return "Hosted relay requires a game id.";
  if (!hostedDraft.companionDeviceId.trim()) return "Hosted relay requires a companion device id.";
  if (!isUuid(hostedDraft.companionDeviceId)) {
    return "Companion device id must be a UUID.";
  }
  if (!hostedDraft.productId.trim()) return "Hosted relay requires a store product id.";
  if (!isUuid(hostedDraft.productId)) return "Store product id must be a UUID.";
  if (hostedDraft.buildId.trim() && !isUuid(hostedDraft.buildId)) return "Build id must be a UUID.";
  if (!normalizeShortToken(hostedDraft.platform)) {
    return "Platform must use letters, numbers, dashes, or underscores.";
  }
  if (!normalizeShortToken(hostedDraft.channel)) {
    return "Channel must use letters, numbers, dashes, or underscores.";
  }
  return null;
}

function buildHostedRelayPackageRef(hostedDraft: HostedRelayDraft) {
  return {
    channel: normalizeShortToken(hostedDraft.channel) ?? "stable",
    delivery: "store-build-ticket",
    downloadTicketRequired: true,
  };
}

function normalizeOptionalUuid(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeShortToken(value: string) {
  const trimmed = value.trim();
  return shortTokenPattern.test(trimmed) ? trimmed.toLowerCase() : null;
}

function isUuid(value: string) {
  return uuidPattern.test(value.trim());
}

function formatHostedRelayExpiry(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}
