import { FolderOpen, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../components/ui/Button";
import { Toggle } from "../components/ui/Toggle";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { getDefaultInstallDir, getSystemInfo } from "../lib/launcher";
import type { SystemInfo } from "../lib/types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function SettingsPage() {
  const [startWithSystem, setStartWithSystem] = useLocalStorageState(
    "launcher.startWithSystem",
    false,
  );
  const [autoUpdateGames, setAutoUpdateGames] = useLocalStorageState(
    "launcher.autoUpdateGames",
    true,
  );
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadNativeSettings() {
      try {
        const [info, defaultDir] = await Promise.all([
          getSystemInfo(),
          getDefaultInstallDir(),
        ]);

        if (isMounted) {
          setSystemInfo(info);
          setInstallDir(defaultDir);
          setCommandError(null);
        }
      } catch (error) {
        if (isMounted) {
          setCommandError(getErrorMessage(error));
        }
      }
    }

    void loadNativeSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleChooseInstallFolder() {
    setFolderMessage(
      "Folder picker stub is ready to be replaced with a native dialog.",
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="rounded-lg border border-white/10 bg-launcher-panel p-5">
          <h2 className="text-lg font-bold text-white">Installation</h2>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Default install folder
            </p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-100">
              {installDir ?? "Loading native path..."}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleChooseInstallFolder}>
              <FolderOpen className="h-4 w-4" />
              Choose Install Folder
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setInstallDir(null);
                setCommandError(null);
                void getDefaultInstallDir()
                  .then(setInstallDir)
                  .catch((error: unknown) =>
                    setCommandError(getErrorMessage(error)),
                  );
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Reload Path
            </Button>
          </div>
          {folderMessage ? (
            <p className="mt-3 text-sm text-slate-400">{folderMessage}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <Toggle
            checked={startWithSystem}
            description="Stored as a local launcher preference."
            label="Start with system"
            onChange={setStartWithSystem}
          />
          <Toggle
            checked={autoUpdateGames}
            description="Stored as a local launcher preference."
            label="Auto-update games"
            onChange={setAutoUpdateGames}
          />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-launcher-panel p-5">
          <h2 className="text-lg font-bold text-white">System</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
              <dt className="text-slate-500">OS</dt>
              <dd className="font-semibold text-white">
                {systemInfo?.os ?? "Unavailable"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
              <dt className="text-slate-500">Arch</dt>
              <dd className="font-semibold text-white">
                {systemInfo?.arch ?? "Unavailable"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">App version</dt>
              <dd className="font-semibold text-white">
                {systemInfo?.appVersion ?? "0.1.0"}
              </dd>
            </div>
          </dl>
        </div>

        {commandError ? (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
            {commandError}
          </div>
        ) : null}
      </aside>
    </section>
  );
}
