import { AlertTriangle, Download, Loader2, ServerCog, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getAccountDeletionProcessorReadiness,
  type PrivacyReadinessCheckStatus,
} from "../../lib/privacy-readiness";
import {
  cancelAccountDeletion,
  exportUserData,
  getLatestAccountDeletionRequest,
  requestAccountDeletion,
  type AccountDeletionRequest,
} from "../../lib/supabase/privacy";

type PrivacyAction = "cancel" | "export" | "request";
type AccountDataPrivacyPanelMode = "local" | "remote";

const LOCAL_ACCOUNT_DELETION_KEY = "og-launcher:privacy-account-deletion:v1";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function saveJsonExport(payload: unknown) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `og-launcher-user-data-${date}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AccountDataPrivacyPanel({
  mode = "remote",
}: {
  mode?: AccountDataPrivacyPanelMode;
}) {
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<PrivacyAction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLocalMode = mode === "local";
  const isPendingDeletion = deletionRequest?.status === "pending";
  const isProcessingDeletion = deletionRequest?.status === "processing";
  const isFailedDeletion = deletionRequest?.status === "failed";
  const isActiveDeletion = isPendingDeletion || isProcessingDeletion;
  const processorReadiness = getAccountDeletionProcessorReadiness({
    latestRequest: deletionRequest,
    loadError: loadErrorMessage,
  });

  useEffect(() => {
    let isMounted = true;

    if (isLocalMode) {
      setDeletionRequest(readLocalAccountDeletionRequest());
      setLoadErrorMessage(null);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void getLatestAccountDeletionRequest()
      .then((request) => {
        if (isMounted) {
          setDeletionRequest(request);
          setLoadErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          const message = getErrorMessage(error);
          setLoadErrorMessage(message);
          setErrorMessage(message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLocalMode]);

  async function runAction(action: PrivacyAction, callback: () => Promise<void>) {
    setBusyAction(action);
    setMessage(null);
    setErrorMessage(null);
    try {
      await callback();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function handleExport() {
    void runAction("export", async () => {
      if (isLocalMode) {
        saveJsonExport(createLocalUserDataExport(deletionRequest));
        setMessage("Local data export ready.");
        return;
      }

      const payload = await exportUserData();
      saveJsonExport(payload);
      setMessage("Data export ready.");
    });
  }

  function handleRequestDeletion() {
    void runAction("request", async () => {
      if (isLocalMode) {
        const request = createLocalAccountDeletionRequest(reason);
        writeLocalAccountDeletionRequest(request);
        setDeletionRequest(request);
        setReason("");
        setMessage(`Local deletion request scheduled for ${formatDateTime(request.scheduled_at)}.`);
        return;
      }

      const request = await requestAccountDeletion(reason);
      setDeletionRequest(request);
      setReason("");
      setMessage(`Deletion request scheduled for ${formatDateTime(request.scheduled_at)}.`);
    });
  }

  function handleCancelDeletion() {
    void runAction("cancel", async () => {
      if (isLocalMode) {
        clearLocalAccountDeletionRequest();
        setDeletionRequest(null);
        setMessage("Local deletion request cancelled.");
        return;
      }

      await cancelAccountDeletion();
      setDeletionRequest(null);
      setMessage("Deletion request cancelled.");
    });
  }

  return (
    <div className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
      <div className="flex flex-col gap-4 border-b-4 border-black bg-[#171411] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-bold uppercase text-[#8cf5e4]">
            {isLocalMode ? "Local DSGVO Console" : "DSGVO Data Console"}
          </p>
          <h2 className="neo-title mt-1 text-3xl leading-none">Account Data</h2>
        </div>
        <button
          className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-xs font-black uppercase text-white shadow-[3px_3px_0_#000] disabled:opacity-60"
          disabled={busyAction !== null || isLoading}
          type="button"
          onClick={handleExport}
        >
          {busyAction === "export" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export JSON
        </button>
      </div>

      {isLocalMode ? (
        <div className="mx-5 mt-5 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#c20b2f]">
            Local Account Preview
          </p>
          <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-5 text-[#5b403f]">
            Export, deletion request, and cancel actions are stored in this browser session while
            Supabase is disconnected.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_300px]">
        <div className="border-2 border-black bg-[#efe6d4] p-4">
          <label
            className="neo-copy text-[10px] font-bold uppercase text-[#55504a]"
            htmlFor="deletion-reason"
          >
            Deletion note
          </label>
          <textarea
            className="mt-2 min-h-28 w-full resize-y border-2 border-black bg-[#fff9ed] p-3 text-sm font-semibold text-[#171411] outline-none focus:bg-white"
            disabled={isActiveDeletion || busyAction !== null}
            id="deletion-reason"
            maxLength={1000}
            placeholder="Optional note for the deletion queue"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              className="neo-copy flex h-11 flex-1 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-xs font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-60"
              disabled={isActiveDeletion || busyAction !== null || isLoading}
              type="button"
              onClick={handleRequestDeletion}
            >
              {busyAction === "request" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Request Deletion
            </button>
            <button
              className="neo-copy flex h-11 flex-1 items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-4 text-xs font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] disabled:opacity-60"
              disabled={!isPendingDeletion || busyAction !== null || isLoading}
              type="button"
              onClick={handleCancelDeletion}
            >
              {busyAction === "cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancel
            </button>
          </div>
        </div>

        <div className="border-2 border-black bg-[#fff9ed] p-4 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Queue Status</p>
          {isLoading ? (
            <div className="mt-5 flex items-center gap-2 text-sm font-black uppercase text-[#171411]">
              <Loader2 className="h-4 w-4 animate-spin text-[#087d6d]" />
              Loading
            </div>
          ) : isPendingDeletion && deletionRequest ? (
            <div className="mt-4 space-y-3">
              <span className="neo-copy inline-flex border-2 border-black bg-[#c20b2f] px-2 py-1 text-[10px] font-black uppercase text-white">
                Pending
              </span>
              <p className="text-sm font-black uppercase text-[#171411]">
                Scheduled {formatDateTime(deletionRequest.scheduled_at)}
              </p>
              <p className="neo-copy text-[10px] font-bold uppercase leading-relaxed text-[#55504a]">
                Auth deletion is not executed by the request function.
              </p>
            </div>
          ) : isProcessingDeletion && deletionRequest ? (
            <div className="mt-4 space-y-3">
              <span className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase text-[#171411]">
                Processing
              </span>
              <p className="text-sm font-black uppercase text-[#171411]">
                Processor claimed {formatDateTime(deletionRequest.updated_at)}
              </p>
              <p className="neo-copy text-[10px] font-bold uppercase leading-relaxed text-[#55504a]">
                Cancellation is closed once the trusted processor has claimed the request.
              </p>
            </div>
          ) : isFailedDeletion && deletionRequest ? (
            <div className="mt-4 space-y-3">
              <span className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase text-[#171411]">
                Failed
              </span>
              <p className="text-sm font-black uppercase text-[#171411]">
                Failed {deletionRequest.failed_at ? formatDateTime(deletionRequest.failed_at) : ""}
              </p>
              <p className="neo-copy text-[10px] font-bold uppercase leading-relaxed text-[#55504a]">
                {deletionRequest.error_message ?? "Processor could not complete the deletion."}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <span className="neo-copy inline-flex border-2 border-black bg-[#087d6d] px-2 py-1 text-[10px] font-black uppercase text-white">
                Clear
              </span>
              <p className="neo-copy text-[10px] font-bold uppercase leading-relaxed text-[#55504a]">
                No pending account deletion request.
              </p>
            </div>
          )}
        </div>
      </div>

      <DeletionProcessorReadinessPanel readiness={processorReadiness} />

      {errorMessage || message ? (
        <div
          className={`mx-5 mb-5 flex gap-3 border-2 border-black p-3 text-sm font-bold ${
            errorMessage ? "bg-[#c20b2f] text-white" : "bg-[#087d6d] text-white"
          }`}
        >
          {errorMessage ? <AlertTriangle className="mt-0.5 h-4 w-4" /> : null}
          <span>{errorMessage ?? message}</span>
        </div>
      ) : null}
    </div>
  );
}

function DeletionProcessorReadinessPanel({
  readiness,
}: {
  readiness: ReturnType<typeof getAccountDeletionProcessorReadiness>;
}) {
  const statusClass =
    readiness.statusLabel === "Ready"
      ? "bg-[#8cf5e4] text-[#171411]"
      : readiness.statusLabel === "Blocked"
        ? "bg-[#c20b2f] text-white"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <section className="mx-5 mb-5 border-2 border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-bold uppercase text-[#c20b2f]">
            Deletion processor readiness
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl leading-none text-[#171411]">
            <ServerCog className="h-5 w-5 text-[#087d6d]" />
            Cron / Secret / Dry-run
          </h3>
        </div>
        <span
          className={`neo-copy inline-flex border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          {readiness.statusLabel}
        </span>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#f5eedf] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-[#171411]">
        {readiness.summary}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <PrivacyReadinessStamp label="Passed" value={String(readiness.passedCount)} />
        <PrivacyReadinessStamp label="Warnings" value={String(readiness.warningCount)} />
        <PrivacyReadinessStamp label="Blocked" value={String(readiness.blockedCount)} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="border-2 border-black bg-[#f5eedf] p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="neo-copy truncate text-[10px] font-black uppercase tracking-[0.1em] text-[#171411]">
                {check.label}
              </span>
              <span
                className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${privacyReadinessCheckClass(
                  check.status,
                )}`}
              >
                {check.status}
              </span>
            </div>
            <p className="neo-copy mt-1 line-clamp-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#55504a]">
              {check.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#c20b2f]">
              Cron Dry-run Packet
            </p>
            <h4 className="mt-1 text-base font-black uppercase leading-tight text-[#171411]">
              {readiness.cronDryRunPacket.method} {readiness.cronDryRunPacket.endpointPath}
            </h4>
          </div>
          <span className="neo-copy inline-flex w-fit border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
            Writes disabled
          </span>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <PrivacyPacketCell
            label="Headers"
            value={readiness.cronDryRunPacket.redactedHeaders
              .map((header) => `${header.name}: ${header.value}`)
              .join(" // ")}
          />
          <PrivacyPacketCell label="Body" value={JSON.stringify(readiness.cronDryRunPacket.body)} />
          <PrivacyPacketCell
            label="Response"
            value={readiness.cronDryRunPacket.expectedResponseKeys.join(" // ")}
          />
        </div>

        <p className="neo-copy mt-2 border-2 border-black bg-[#fff9ed] p-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#55504a]">
          {readiness.cronDryRunPacket.scheduleHint} This local packet does not call hosted cron,
          delete storage, or delete auth users.
        </p>
      </div>

      <div className="mt-3 border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
        <div className="flex flex-col gap-3 border-b-2 border-black pb-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#c20b2f]">
              Hosted Cron Staging Proof
            </p>
            <h4 className="neo-title mt-1 text-2xl leading-none text-[#171411]">
              {readiness.hostedCronStagingProof.functionName}
            </h4>
            <p className="neo-copy mt-2 max-w-4xl text-[10px] font-black uppercase leading-5 tracking-[0.06em] text-[#55504a]">
              {readiness.hostedCronStagingProof.guardCopy}
            </p>
          </div>
          <div className="grid w-full shrink-0 grid-cols-1 gap-2 text-[10px] sm:grid-cols-2 lg:w-[560px] lg:grid-cols-4">
            <PrivacyProofStamp label="Workflow" value={readiness.hostedCronStagingProof.workflow} />
            <PrivacyProofStamp
              label="Evidence"
              value={readiness.hostedCronStagingProof.evidenceTable}
            />
            <PrivacyProofStamp
              label="Function"
              value={readiness.hostedCronStagingProof.functionName}
            />
            <PrivacyProofStamp label="Writes" value={readiness.hostedCronStagingProof.writeMode} />
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_2fr]">
          <PrivacyPacketCell
            label="Trigger"
            value={`${readiness.hostedCronStagingProof.triggerSource} // ${readiness.hostedCronStagingProof.latestRunId} // ${readiness.hostedCronStagingProof.endpointPath}`}
          />
          <PrivacyPacketCell
            label="Expected dry-run response"
            value={JSON.stringify(readiness.hostedCronStagingProof.expectedDryRunResponse)}
          />
        </div>

        <div className="mt-3 grid gap-2 xl:grid-cols-5">
          {readiness.hostedCronStagingProof.rows.map((row) => (
            <div key={row.id} className="border-2 border-black bg-[#fff9ed] p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="neo-copy text-[9px] font-black uppercase tracking-[0.08em] text-[#171411]">
                  {row.label}
                </span>
                <span
                  className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${privacyReadinessCheckClass(
                    row.status,
                  )}`}
                >
                  {row.status}
                </span>
              </div>
              <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 tracking-[0.06em] text-[#55504a]">
                {row.detail}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {readiness.hostedCronStagingProof.guards.map((guard) => (
            <p
              className="neo-copy border-2 border-black bg-[#171411] px-2 py-2 text-[8px] font-black uppercase leading-4 tracking-[0.08em] text-[#fff9ed]"
              key={guard}
            >
              {guard}
            </p>
          ))}
        </div>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#c20b2f] p-2 text-[10px] font-black uppercase leading-5 tracking-[0.08em] text-white">
        Final DSGVO processor go-live still needs hosted cron delivery with a real
        ACCOUNT_DELETION_PROCESSOR_SECRET against a staging Supabase project.
      </p>
    </section>
  );
}

function PrivacyPacketCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#fff9ed] p-2">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#55504a]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 tracking-[0.05em] text-[#171411]">
        {value}
      </p>
    </div>
  );
}

function PrivacyProofStamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.1em] text-[#55504a]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-words text-[9px] font-black uppercase leading-4 tracking-[0.05em] text-[#171411]">
        {value}
      </p>
    </div>
  );
}

function PrivacyReadinessStamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.1em] text-[#55504a]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black leading-none text-[#171411]">{value}</p>
    </div>
  );
}

function privacyReadinessCheckClass(status: PrivacyReadinessCheckStatus) {
  switch (status) {
    case "pass":
      return "bg-[#8cf5e4] text-[#171411]";
    case "warning":
      return "bg-[#fff9ed] text-[#171411]";
    case "blocked":
      return "bg-[#c20b2f] text-white";
  }
}

function createLocalAccountDeletionRequest(reason: string): AccountDeletionRequest {
  const requestedAt = new Date();
  const scheduledAt = new Date(requestedAt.getTime() + 30 * 86_400_000);
  const now = requestedAt.toISOString();

  return {
    cancelled_at: null,
    completed_at: null,
    created_at: now,
    error_message: null,
    failed_at: null,
    id: `local-delete-${requestedAt.getTime()}`,
    reason: reason.trim() || null,
    requested_at: now,
    request_metadata: {
      mode: "local_preview",
      source: "browser_fallback",
    },
    scheduled_at: scheduledAt.toISOString(),
    status: "pending",
    updated_at: now,
    user_id: "local-privacy-user",
  };
}

function createLocalUserDataExport(deletionRequest: AccountDeletionRequest | null) {
  return {
    data: {
      accountDeletionRequest: deletionRequest,
      achievements: [{ gameTitle: "Neon Drift", unlocked: 14 }],
      library: [{ platform: "Steam", title: "Neon Drift" }],
      privacy: {
        exportMode: "local_preview",
        generatedBy: "OG-Launcher browser fallback",
      },
      profile: {
        displayName: "Local Privacy Runner",
        username: "localprivacy",
      },
    },
    generatedAt: new Date().toISOString(),
    user: {
      appMetadata: { provider: "local" },
      createdAt: "2026-06-10T12:00:00.000Z",
      email: "localprivacy@example.test",
      id: "local-privacy-user",
      lastSignInAt: "2026-06-10T12:00:00.000Z",
      userMetadata: { mode: "local_preview" },
    },
  };
}

function readLocalAccountDeletionRequest() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_ACCOUNT_DELETION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AccountDeletionRequest;
    if (typeof parsed.id === "string" && typeof parsed.status === "string") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function writeLocalAccountDeletionRequest(request: AccountDeletionRequest) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_ACCOUNT_DELETION_KEY, JSON.stringify(request));
}

function clearLocalAccountDeletionRequest() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LOCAL_ACCOUNT_DELETION_KEY);
}
