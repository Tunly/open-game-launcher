import { FolderOpen, HardDrive, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { getDefaultInstallDir, getSystemInfo } from "../lib/launcher";
import type { SystemInfo } from "../lib/types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

interface NeoToggleProps {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}

function NeoToggle({ checked, description, label, onChange }: NeoToggleProps) {
  return (
    <div className="grid gap-4 border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411] sm:grid-cols-[1fr_110px] sm:items-center">
      <div>
        <h3 className="text-2xl font-black uppercase leading-none text-[#171411]">
          {label}
        </h3>
        <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#55504a]">
          {description}
        </p>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={`neo-copy h-12 border-2 border-black text-xs font-bold uppercase shadow-[3px_3px_0_#171411] ${
          checked ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"
        }`}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        {checked ? "Aktiv" : "Aus"}
      </button>
    </div>
  );
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
      "Native folder dialog ist vorbereitet und wartet auf Tauri-Integration.",
    );
  }

  function handleReloadPath() {
    setInstallDir(null);
    setCommandError(null);
    void getDefaultInstallDir()
      .then(setInstallDir)
      .catch((error: unknown) => setCommandError(getErrorMessage(error)));
  }

  return (
    <section>
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              System Konfiguration
            </span>
            <h1 className="neo-title mt-2 max-w-[680px] text-[clamp(3.5rem,15vw,6rem)] leading-[0.82] text-[#171411]">
              Settings Panel
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              Launcher runtime // lokaler speicher // native pfade
            </p>
          </div>

          <button
            className="neo-copy flex h-10 w-full items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] sm:w-fit"
            type="button"
            onClick={handleReloadPath}
          >
            <RefreshCw className="h-4 w-4" />
            Neu laden
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Installationsziel
                </p>
                <h2 className="text-3xl font-black uppercase text-[#171411]">
                  Game Storage
                </h2>
              </div>
              <HardDrive className="h-10 w-10 text-[#c20b2f]" />
            </div>

            <div className="p-5">
              <div className="border-2 border-black bg-[#efe6d4] p-4">
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Default install folder
                </p>
                <p className="mt-2 break-all text-lg font-black text-[#171411]">
                  {installDir ?? "Native path wird geladen..."}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleChooseInstallFolder}
                >
                  <FolderOpen className="h-4 w-4" />
                  Ordner wahlen
                </button>
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleReloadPath}
                >
                  <RefreshCw className="h-4 w-4" />
                  Pfad neu laden
                </button>
              </div>

              {folderMessage ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#087d6d] px-3 py-2 text-[10px] font-bold uppercase text-white">
                  {folderMessage}
                </p>
              ) : null}
            </div>
          </div>

          <NeoToggle
            checked={startWithSystem}
            description="Lokale launcher-praferenz im browser-speicher"
            label="Start mit System"
            onChange={setStartWithSystem}
          />
          <NeoToggle
            checked={autoUpdateGames}
            description="Updates automatisch in die download queue einreihen"
            label="Auto-Update Games"
            onChange={setAutoUpdateGames}
          />
        </div>

        <aside className="space-y-4">
          <div className="border-4 border-black bg-[#171411] p-5 text-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center gap-3">
              <Power className="h-6 w-6 text-[#c20b2f]" />
              <h2 className="text-2xl font-black uppercase">Runtime</h2>
            </div>
            <dl className="mt-5 space-y-3">
              {[
                ["OS", systemInfo?.os ?? "Unavailable"],
                ["Arch", systemInfo?.arch ?? "Unavailable"],
                ["Version", systemInfo?.appVersion ?? "0.1.0"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-2 border-[#f5eedf] p-3"
                >
                  <dt className="neo-copy text-[10px] font-bold uppercase">
                    {label}
                  </dt>
                  <dd className="font-black uppercase">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="border-b-4 border-black p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#087d6d]" />
                <h2 className="text-2xl font-black uppercase">Status</h2>
              </div>
            </div>
            <div className="p-5">
              <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Native Commands
              </p>
              <p className="mt-2 text-3xl font-black uppercase text-[#171411]">
                {commandError ? "Fallback" : "Bereit"}
              </p>
              {commandError ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#efe6d4] p-3 text-[10px] font-bold uppercase text-[#55504a]">
                  {commandError}
                </p>
              ) : (
                <p className="neo-copy mt-4 text-[10px] font-bold uppercase text-[#55504a]">
                  Systemdaten wurden geladen.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
