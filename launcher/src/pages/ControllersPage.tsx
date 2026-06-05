import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ControllerLayoutEditor } from "../components/controllers/ControllerLayoutEditor";
import { getControllerRuntimeStatus, listControllers } from "../lib/launcher";
import type { ControllerDevice, ControllerRuntimeStatus } from "../lib/types/controllers";

export function ControllersPage() {
  const [devices, setDevices] = useState<ControllerDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<ControllerRuntimeStatus | null>(null);

  async function refreshDevices() {
    setIsLoading(true);
    setError(null);
    try {
      const [nextDevices, nextStatus] = await Promise.all([
        listControllers(),
        getControllerRuntimeStatus().catch(() => null),
      ]);
      setDevices(nextDevices);
      setRuntimeStatus(nextStatus);
    } catch (err) {
      setDevices([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshDevices();
  }, []);

  return (
    <main className="min-h-full bg-[#efe3cf] p-4 text-[#171411] md:p-6">
      <section className="mb-5 border-4 border-black bg-[#f6edd8] p-5 shadow-[8px_8px_0_#171411]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="neo-copy text-[11px] font-black uppercase tracking-[0.25em] text-[#b7102a]">
              OG-Launcher Input
            </p>
            <h1 className="neo-title mt-2 text-5xl uppercase leading-none">Controller Support</h1>
            <div className="neo-dots mt-3 h-2 w-16 bg-black" />
            <p className="neo-copy mt-4 max-w-3xl text-sm font-bold uppercase leading-6 text-[#5f574d]">
              Steam-like controller hub: device detection, global defaults, per-game profiles,
              community layouts, gyro and haptics flags.
            </p>
          </div>
          <button
            type="button"
            className="neo-copy flex h-12 items-center gap-2 border-2 border-black bg-[#8cf5e4] px-4 text-xs font-black uppercase shadow-[4px_4px_0_#171411] hover:bg-[#67e5d3]"
            onClick={() => void refreshDevices()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Scan Pads
          </button>
        </div>
        {error ? (
          <p className="neo-copy mt-4 border-2 border-black bg-[#b7102a] p-3 text-xs font-black uppercase text-white">
            {error}
          </p>
        ) : null}
      </section>

      {runtimeStatus ? (
        <section className="mb-5 grid gap-3 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411] md:grid-cols-3">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
              Active Layout
            </p>
            <p className="neo-title mt-1 text-2xl uppercase">
              {runtimeStatus.activeLayoutName ?? "None"}
            </p>
          </div>
          <div>
            <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Runtime</p>
            <p className="neo-copy mt-1 text-xs font-black uppercase">
              {runtimeStatus.activeTemplate ?? "Idle"} · ViGEm{" "}
              {runtimeStatus.vigemBusDetected ? "Ready" : "Missing"}
            </p>
          </div>
          <p className="neo-copy border-2 border-black bg-[#efe3cf] p-2 text-[10px] font-bold uppercase leading-5 text-[#5f574d] md:col-span-1">
            {runtimeStatus.driverMessage}
          </p>
        </section>
      ) : null}

      <ControllerLayoutEditor devices={devices} />
    </main>
  );
}
