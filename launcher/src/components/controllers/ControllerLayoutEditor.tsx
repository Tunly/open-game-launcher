import { Gamepad2, RefreshCw, Save, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { deleteControllerLayout, listControllerLayouts, saveControllerLayout } from "../../lib/supabase/controllers";
import type {
  ControllerDevice,
  ControllerLayout,
  ControllerMappingBinding,
  ControllerTemplate,
  ControllerType,
} from "../../lib/types/controllers";
import { CONTROLLER_INPUTS, DEFAULT_CONTROLLER_BINDINGS } from "../../lib/types/controllers";

const controllerTypes: ControllerType[] = ["xbox", "playstation", "switch", "steam", "generic"];
const templates: Array<{ value: ControllerTemplate; label: string; description: string }> = [
  { value: "gamepad", label: "Gamepad", description: "Standard pad to pad mapping." },
  { value: "gamepadGyro", label: "Gamepad + Gyro", description: "Pad mapping with gyro intent saved." },
  { value: "keyboardMouse", label: "Keyboard/Mouse", description: "Steam-like profile for games without native pad support." },
  { value: "disabled", label: "Disabled", description: "Per-game opt-out." },
];

interface ControllerLayoutEditorProps {
  gameId?: string | null;
  gameTitle?: string;
  devices?: ControllerDevice[];
  compact?: boolean;
}

function makeDefaultName(gameTitle: string | undefined, controllerType: ControllerType) {
  return gameTitle ? `${gameTitle} ${controllerType} layout` : `${controllerType} global layout`;
}

function cloneBindings(bindings: ControllerMappingBinding[]) {
  return bindings.map((binding) => ({ ...binding }));
}

export function ControllerLayoutEditor({ gameId = null, gameTitle, devices = [], compact = false }: ControllerLayoutEditorProps) {
  const detectedType = devices.find((device) => device.isConnected)?.controllerType ?? "xbox";
  const [controllerType, setControllerType] = useState<ControllerType>(detectedType);
  const [layouts, setLayouts] = useState<ControllerLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("new");
  const [name, setName] = useState(makeDefaultName(gameTitle, detectedType));
  const [template, setTemplate] = useState<ControllerTemplate>("gamepad");
  const [bindings, setBindings] = useState<ControllerMappingBinding[]>(cloneBindings(DEFAULT_CONTROLLER_BINDINGS));
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [isCommunity, setIsCommunity] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId],
  );

  async function refreshLayouts(nextType = controllerType) {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listControllerLayouts({ gameId, controllerType: nextType, includeGlobal: Boolean(gameId) });
      setLayouts(rows);
      const preferred = rows.find((layout) => layout.gameId === gameId && layout.isDefault) ?? rows[0] ?? null;
      if (preferred) {
        setSelectedLayoutId(preferred.id);
        loadLayout(preferred);
      } else {
        resetDraft(nextType);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  function loadLayout(layout: ControllerLayout) {
    setName(layout.name);
    setControllerType(layout.controllerType);
    setTemplate(layout.template);
    setBindings(layout.bindings.length > 0 ? cloneBindings(layout.bindings) : cloneBindings(DEFAULT_CONTROLLER_BINDINGS));
    setGyroEnabled(layout.gyroEnabled);
    setHapticsEnabled(layout.hapticsEnabled);
    setIsCommunity(layout.isCommunity);
    setIsDefault(layout.isDefault);
  }

  function resetDraft(nextType = controllerType) {
    setSelectedLayoutId("new");
    setName(makeDefaultName(gameTitle, nextType));
    setControllerType(nextType);
    setTemplate("gamepad");
    setBindings(cloneBindings(DEFAULT_CONTROLLER_BINDINGS));
    setGyroEnabled(false);
    setHapticsEnabled(true);
    setIsCommunity(false);
    setIsDefault(true);
  }

  useEffect(() => {
    setControllerType(detectedType);
    void refreshLayouts(detectedType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedType, gameId]);

  async function handleSave() {
    setIsLoading(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await saveControllerLayout({
        id: selectedLayout?.isCommunity ? undefined : selectedLayout?.id,
        gameId,
        name: name.trim() || makeDefaultName(gameTitle, controllerType),
        controllerType,
        template,
        bindings,
        gyroEnabled,
        hapticsEnabled,
        isCommunity,
        isDefault,
      });
      setMessage(isCommunity ? "Layout saved and shared with the community." : "Controller layout saved.");
      setSelectedLayoutId(saved.id);
      await refreshLayouts(controllerType);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!selectedLayout || selectedLayout.isCommunity) return;
    setIsLoading(true);
    setMessage(null);
    setError(null);
    try {
      await deleteControllerLayout(selectedLayout.id);
      setMessage("Controller layout deleted.");
      await refreshLayouts(controllerType);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  function updateBinding(index: number, output: string) {
    setBindings((current) => current.map((binding, i) => (i === index ? { ...binding, output } : binding)));
  }

  return (
    <section className="border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">Steam Input Style</p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Gamepad2 className="h-8 w-8" /> Controller Layouts
          </h2>
          <p className="neo-copy mt-2 max-w-2xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Detect pads, choose per-game layouts, remap buttons, save global defaults and publish community presets.
          </p>
        </div>
        <button
          type="button"
          className="neo-copy flex h-10 items-center gap-2 border-2 border-black bg-[#efe3cf] px-3 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] hover:bg-[#8cf5e4]"
          onClick={() => void refreshLayouts()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {devices.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {devices.map((device) => (
            <div key={device.id} className="border-2 border-black bg-[#f4ead8] p-3 shadow-[3px_3px_0_#171411]">
              <p className="neo-copy text-[11px] font-black uppercase text-[#171411]">{device.name}</p>
              <p className="neo-copy mt-1 text-[10px] font-bold uppercase text-[#5f574d]">
                {device.controllerType} · {device.source} · {device.isConnected ? "connected" : "offline"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3">
          <p className="neo-copy text-[11px] font-black uppercase text-[#5f574d]">
            No controller detected. You can still prepare layouts like Steam does.
          </p>
        </div>
      )}

      <div className={`mt-4 grid gap-4 ${compact ? "" : "xl:grid-cols-[320px_1fr]"}`}>
        <aside className="space-y-3">
          <label className="block">
            <span className="neo-copy text-[10px] font-black uppercase">Controller Type</span>
            <select
              className="neo-copy mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-xs font-bold uppercase"
              value={controllerType}
              onChange={(event) => {
                const next = event.target.value as ControllerType;
                setControllerType(next);
                void refreshLayouts(next);
              }}
            >
              {controllerTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="neo-copy text-[10px] font-black uppercase">Layout</span>
            <select
              className="neo-copy mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-xs font-bold uppercase"
              value={selectedLayoutId}
              onChange={(event) => {
                const id = event.target.value;
                if (id === "new") {
                  resetDraft();
                } else {
                  const layout = layouts.find((item) => item.id === id);
                  if (layout) {
                    setSelectedLayoutId(id);
                    loadLayout(layout);
                  }
                }
              }}
            >
              <option value="new">New layout</option>
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}{layout.isCommunity ? " · community" : layout.gameId ? " · game" : " · global"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="neo-copy text-[10px] font-black uppercase">Name</span>
            <input
              className="neo-copy mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-xs font-bold uppercase"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="grid gap-2">
            {templates.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`border-2 border-black p-3 text-left shadow-[3px_3px_0_#171411] ${template === item.value ? "bg-[#087d6d] text-white" : "bg-[#f4ead8] text-[#171411] hover:bg-[#8cf5e4]"}`}
                onClick={() => setTemplate(item.value)}
              >
                <span className="neo-copy block text-[11px] font-black uppercase">{item.label}</span>
                <span className="neo-copy mt-1 block text-[10px] font-bold uppercase opacity-80">{item.description}</span>
              </button>
            ))}
          </div>
        </aside>

        <div>
          <div className="grid gap-2 md:grid-cols-2">
            <button type="button" className={`neo-copy border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${gyroEnabled ? "bg-[#087d6d] text-white" : "bg-[#efe3cf]"}`} onClick={() => setGyroEnabled((value) => !value)}>
              Gyro {gyroEnabled ? "On" : "Off"}
            </button>
            <button type="button" className={`neo-copy border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${hapticsEnabled ? "bg-[#087d6d] text-white" : "bg-[#efe3cf]"}`} onClick={() => setHapticsEnabled((value) => !value)}>
              Haptics {hapticsEnabled ? "On" : "Off"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {bindings.map((binding, index) => (
              <label key={binding.input} className="grid gap-1 border-2 border-black bg-[#f4ead8] p-2">
                <span className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">{binding.input}</span>
                <select className="neo-copy h-9 border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold uppercase" value={binding.output} onChange={(event) => updateBinding(index, event.target.value)}>
                  {CONTROLLER_INPUTS.map((input) => (
                    <option key={input} value={input}>{input}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={`neo-copy flex items-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${isDefault ? "bg-[#e8c843]" : "bg-[#efe3cf]"}`} onClick={() => setIsDefault((value) => !value)}>
              Default {isDefault ? "On" : "Off"}
            </button>
            <button type="button" className={`neo-copy flex items-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${isCommunity ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"}`} onClick={() => setIsCommunity((value) => !value)}>
              <Share2 className="h-4 w-4" /> Community
            </button>
            <button type="button" className="neo-copy flex items-center gap-2 border-2 border-black bg-[#087d6d] px-4 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411]" onClick={() => void handleSave()} disabled={isLoading}>
              <Save className="h-4 w-4" /> Save Layout
            </button>
            <button type="button" className="neo-copy flex items-center gap-2 border-2 border-black bg-[#b7102a] px-3 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-45" onClick={() => void handleDelete()} disabled={!selectedLayout || selectedLayout.isCommunity || isLoading}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>

          {message ? <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] p-2 text-[11px] font-black uppercase">{message}</p> : null}
          {error ? <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-2 text-[11px] font-black uppercase text-white">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
