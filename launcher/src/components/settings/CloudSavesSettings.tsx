import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  KeyRound,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import {
  generateCloudKey,
  isCloudKeyPresent,
  rotateCloudKey,
} from "../../lib/launcher";
import { getCloudStorageUsage } from "../../lib/supabase/cloud-saves";
import { useCurrentUser } from "../../hooks/useCurrentUser";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type KeyState = "loading" | "present" | "missing";

export function CloudSavesSettings() {
  const user = useCurrentUser();
  const userId = user?.session?.user?.id ?? null;

  const [keyState, setKeyState] = useState<KeyState>("loading");
  const [usage, setUsage] = useState<{ setCount: number; fileCount: number; totalSizeBytes: number } | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<null | "generate" | "rotate" | "refresh">(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const refreshAll = useCallback(async () => {
    setErrorMessage(null);
    if (!userId) {
      setKeyState("missing");
      setUsage(null);
      return;
    }
    setActionBusy("refresh");
    try {
      const present = await isCloudKeyPresent(userId);
      setKeyState(present ? "present" : "missing");
      try {
        const next = await getCloudStorageUsage();
        setUsage(next);
      } catch {
        setUsage(null);
      }
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }, [userId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleGenerate = useCallback(async () => {
    if (!userId) {
      setErrorMessage("Sign in required to manage cloud key.");
      return;
    }
    setActionBusy("generate");
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await generateCloudKey(userId);
      setKeyState("present");
      setInfoMessage("Cloud key created in OS keychain.");
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }, [userId]);

  const handleRotate = useCallback(async () => {
    if (!userId) {
      setErrorMessage("Sign in required to rotate cloud key.");
      return;
    }
    setConfirmRotate(false);
    setActionBusy("rotate");
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await rotateCloudKey(userId);
      setKeyState("present");
      setInfoMessage(
        "Cloud key rotated. Existing cloud saves encrypted with the old key are now unreadable — re-upload after rotating.",
      );
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }, [userId]);

  const keyBadge = {
    loading: { label: "Checking…", className: "bg-[#ded3c1] text-[#171411]" },
    present: { label: "Active", className: "bg-[#087d6d] text-white" },
    missing: { label: "Missing", className: "bg-[#b7102a] text-white" },
  }[keyState];

  return (
    <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-between border-b-4 border-black p-5">
        <div>
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
            Cloud Sync
          </p>
          <h2 className="text-3xl font-black uppercase text-[#171411]">Cloud Saves</h2>
        </div>
        <Cloud className="h-10 w-10 text-[#087d6d]" />
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
            <div className="mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#171411]" />
              <span className="text-xs font-black uppercase text-[#171411]">
                Master Key
              </span>
              <span
                className={`neo-copy ml-auto border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${keyBadge.className}`}
              >
                {keyBadge.label}
              </span>
            </div>
            <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
              Stored in the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service).
              Encrypts every save before upload.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="neo-copy flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!userId || actionBusy !== null || keyState === "present"}
                type="button"
                onClick={() => void handleGenerate()}
              >
                {actionBusy === "generate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Generate
              </button>
              <button
                className="neo-copy flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!userId || actionBusy !== null || keyState !== "present"}
                type="button"
                onClick={() => setConfirmRotate(true)}
              >
                {actionBusy === "rotate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Rotate
              </button>
              <button
                className="neo-copy flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={actionBusy !== null}
                type="button"
                onClick={() => void refreshAll()}
              >
                {actionBusy === "refresh" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
            </div>
          </div>

          <div className="border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
            <div className="mb-2 flex items-center gap-2">
              <Cloud className="h-4 w-4 text-[#171411]" />
              <span className="text-xs font-black uppercase text-[#171411]">
                Storage Usage
              </span>
            </div>
            {usage ? (
              <dl className="space-y-1 text-[11px] font-black uppercase">
                <div className="flex items-center justify-between border-b border-black/15 pb-1">
                  <dt className="text-[#55504a]">Games tracked</dt>
                  <dd className="text-[#171411]">{usage.setCount}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-black/15 pb-1">
                  <dt className="text-[#55504a]">Files tracked</dt>
                  <dd className="text-[#171411]">{usage.fileCount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#55504a]">Stored size</dt>
                  <dd className="text-[#171411]">
                    {formatBytes(usage.totalSizeBytes)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Sign in and run the cloud setup script to see usage.
              </p>
            )}
          </div>
        </div>

        {infoMessage ? (
          <div className="border-2 border-black bg-[#d4f1ea] p-3 text-[10px] font-black uppercase text-[#06685a]">
            {infoMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="border-2 border-black bg-[#fbd6dc] p-3 text-[10px] font-black uppercase text-[#7a0918]">
            {errorMessage}
          </div>
        ) : null}

        {confirmRotate ? (
          <div className="flex flex-col gap-2 border-2 border-black bg-[#fbd6dc] p-3 text-[11px] font-black uppercase text-[#7a0918]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Rotating invalidates all existing cloud saves. Continue?</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] hover:bg-[#990a20]"
                type="button"
                onClick={() => void handleRotate()}
              >
                Yes, rotate key
              </button>
              <button
                className="border-2 border-black bg-[#fbf4e7] px-3 py-1 text-[10px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#000] hover:bg-[#efe3cf]"
                type="button"
                onClick={() => setConfirmRotate(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
          Tip: Run <code className="bg-[#efe6d4] px-1">pnpm setup:cloud</code> once to
          ensure the private <code className="bg-[#efe6d4] px-1">game-saves</code>{" "}
          bucket and RLS policies exist in your Supabase project.
        </p>
      </div>
    </div>
  );
}
