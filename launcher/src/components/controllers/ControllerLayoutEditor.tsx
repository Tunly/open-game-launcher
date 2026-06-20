import {
  Download,
  Flag,
  Gamepad2,
  Power,
  RefreshCw,
  Save,
  Share2,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyControllerLayout, clearControllerLayout } from "../../lib/launcher";
import {
  deleteControllerLayout,
  listControllerLayouts,
  listHostedControllerLayouts,
  recordHostedControllerLayoutDownload,
  reportHostedControllerLayout,
  saveControllerLayout,
  setHostedControllerLayoutVote,
} from "../../lib/supabase/controllers";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import type {
  ControllerDevice,
  ControllerLayout,
  ControllerMappingBinding,
  ControllerRuntimeStatus,
  ControllerTemplate,
  ControllerType,
} from "../../lib/types/controllers";
import { CONTROLLER_OUTPUTS, DEFAULT_CONTROLLER_BINDINGS } from "../../lib/types/controllers";

const controllerTypes: ControllerType[] = ["xbox", "playstation", "switch", "steam", "generic"];
const LOCAL_CONTROLLER_LAYOUTS_KEY = "og-launcher:controller-layouts:v1";
const LOCAL_CONTROLLER_LAYOUT_VOTES_KEY = "og-launcher:controller-layout-votes:v1";
const CONTROLLER_RUNTIME_PREVIEW_GAME_ID = "global-controller-preview";
const templates: Array<{ value: ControllerTemplate; label: string; description: string }> = [
  { value: "gamepad", label: "Gamepad", description: "Standard pad to pad mapping." },
  {
    value: "gamepadGyro",
    label: "Gamepad + Gyro",
    description: "Pad mapping with gyro intent saved.",
  },
  {
    value: "keyboardMouse",
    label: "Keyboard/Mouse",
    description: "Steam-like profile for games without native pad support.",
  },
  { value: "disabled", label: "Disabled", description: "Per-game opt-out." },
];

interface CommunityLayoutTemplate {
  authorName: string;
  bindings: ControllerMappingBinding[];
  description: string;
  downloads: number;
  gyroEnabled: boolean;
  hapticsEnabled: boolean;
  id: string;
  name: string;
  reportCount?: number;
  source: "hosted" | "local";
  tags: string[];
  template: ControllerTemplate;
  userVote?: -1 | 0 | 1;
  votes: number;
}

function withBindingOverrides(
  overrides: Partial<Record<(typeof DEFAULT_CONTROLLER_BINDINGS)[number]["input"], string>>,
): ControllerMappingBinding[] {
  return DEFAULT_CONTROLLER_BINDINGS.map((binding) => ({
    ...binding,
    output: overrides[binding.input] ?? binding.output,
  }));
}

const communityLayoutGallery: CommunityLayoutTemplate[] = [
  {
    authorName: "OG Arena Lab",
    bindings: withBindingOverrides({
      "A / Cross": "Space",
      "B / Circle": "Left Ctrl",
      "LT / L2": "Left Shift",
      "RT / R2": "Mouse Left",
      "X / Square": "R",
      "Y / Triangle": "E",
    }),
    description: "Fast action preset for arcade shooters and arena brawlers.",
    downloads: 8420,
    gyroEnabled: false,
    hapticsEnabled: true,
    id: "arcade-twin-stick",
    name: "Arcade Twin-Stick",
    source: "local",
    tags: ["Action", "Keyboard", "Local"],
    template: "keyboardMouse",
    votes: 1248,
  },
  {
    authorName: "Paper Duelists",
    bindings: withBindingOverrides({
      "A / Cross": "A / Cross",
      "B / Circle": "Space",
      "LB / L1": "Left Ctrl",
      "LT / L2": "Mouse Right",
      "RB / R1": "Mouse Middle",
      "RT / R2": "Mouse Left",
    }),
    description: "Guard, roll, lock-on, and heavy attack routing for action RPGs.",
    downloads: 6390,
    gyroEnabled: false,
    hapticsEnabled: true,
    id: "guard-roll-rpg",
    name: "Guard Roll RPG",
    source: "local",
    tags: ["RPG", "Melee", "Default"],
    template: "gamepad",
    votes: 931,
  },
  {
    authorName: "Neon Aim Club",
    bindings: withBindingOverrides({
      "A / Cross": "Space",
      "B / Circle": "Left Ctrl",
      "LB / L1": "R",
      "LT / L2": "Mouse Right",
      "RB / R1": "Mouse Middle",
      "RT / R2": "Mouse Left",
      "X / Square": "F",
      "Y / Triangle": "E",
    }),
    description: "Gyro-assisted FPS profile with mouse fire and quick utility keys.",
    downloads: 7012,
    gyroEnabled: true,
    hapticsEnabled: true,
    id: "gyro-fps-flick",
    name: "Gyro FPS Flick",
    source: "local",
    tags: ["FPS", "Gyro", "Mouse"],
    template: "gamepadGyro",
    votes: 1104,
  },
];

interface ControllerLayoutEditorProps {
  gameId?: string | null;
  gameTitle?: string;
  devices?: ControllerDevice[];
  compact?: boolean;
  runtimeStatus?: ControllerRuntimeStatus | null;
  onRuntimeStatusChange?: (status: ControllerRuntimeStatus) => void;
}

function makeDefaultName(gameTitle: string | undefined, controllerType: ControllerType) {
  return gameTitle ? `${gameTitle} ${controllerType} layout` : `${controllerType} global layout`;
}

function cloneBindings(bindings: ControllerMappingBinding[]) {
  return bindings.map((binding) => ({ ...binding }));
}

export function ControllerLayoutEditor({
  gameId = null,
  gameTitle,
  devices = [],
  compact = false,
  runtimeStatus = null,
  onRuntimeStatusChange,
}: ControllerLayoutEditorProps) {
  const detectedType = devices.find((device) => device.isConnected)?.controllerType ?? "xbox";
  const [controllerType, setControllerType] = useState<ControllerType>(detectedType);
  const [layouts, setLayouts] = useState<ControllerLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("new");
  const [name, setName] = useState(makeDefaultName(gameTitle, detectedType));
  const [template, setTemplate] = useState<ControllerTemplate>("gamepad");
  const [bindings, setBindings] = useState<ControllerMappingBinding[]>(
    cloneBindings(DEFAULT_CONTROLLER_BINDINGS),
  );
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [isCommunity, setIsCommunity] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRuntimeBusy, setIsRuntimeBusy] = useState(false);
  const [isLocalFallback, setIsLocalFallback] = useState(!isSupabaseConfigured);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [localCommunityVotes, setLocalCommunityVotes] = useState<Set<string>>(() =>
    readStoredCommunityVoteIds(),
  );
  const [hostedCommunityLayouts, setHostedCommunityLayouts] = useState<CommunityLayoutTemplate[]>(
    [],
  );
  const [hostedGalleryMessage, setHostedGalleryMessage] = useState<string | null>(null);
  const [hostedGalleryError, setHostedGalleryError] = useState<string | null>(null);
  const [hostedActionBusyId, setHostedActionBusyId] = useState<string | null>(null);
  const [isHostedGalleryLoading, setIsHostedGalleryLoading] = useState(false);

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId],
  );

  async function refreshLayouts(nextType = controllerType) {
    setIsLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        const rows = getLocalControllerLayouts(nextType, gameId);
        setIsLocalFallback(true);
        setLayouts(rows);
        loadPreferredLayout(rows, nextType);
        setMessage(
          "Local layout cache active. Connect Supabase to stage controller preset sharing.",
        );
        setHostedCommunityLayouts([]);
        setHostedGalleryMessage(null);
        setHostedGalleryError(null);
        return;
      }

      const rows = await listControllerLayouts({
        gameId,
        controllerType: nextType,
        includeGlobal: Boolean(gameId),
      });
      setIsLocalFallback(false);
      setLayouts(rows);
      loadPreferredLayout(rows, nextType);
    } catch (err) {
      const rows = getLocalControllerLayouts(nextType, gameId);
      setIsLocalFallback(true);
      setLayouts(rows);
      loadPreferredLayout(rows, nextType);
      setError(
        `Hosted layout service unavailable; using local controller presets. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsLoading(false);
      if (isSupabaseConfigured) {
        void refreshHostedCommunityLayouts(nextType);
      }
    }
  }

  async function refreshHostedCommunityLayouts(nextType = controllerType) {
    if (!isSupabaseConfigured) return;

    setIsHostedGalleryLoading(true);
    setHostedGalleryError(null);
    try {
      const result = await listHostedControllerLayouts({
        controllerType: nextType,
        gameId,
        limit: 12,
      });

      if (!result.ok) {
        setHostedCommunityLayouts([]);
        setHostedGalleryMessage(null);
        setHostedGalleryError(`${result.message} Local import deck remains available.`);
        return;
      }

      setHostedCommunityLayouts(result.value.map(hostedLayoutToCommunityTemplate));
      setHostedGalleryMessage(
        result.value.length > 0
          ? "Approved hosted rows loaded from Supabase for review."
          : "No approved hosted layouts matched this controller; local import deck remains available.",
      );
    } catch (err) {
      setHostedCommunityLayouts([]);
      setHostedGalleryMessage(null);
      setHostedGalleryError(
        `Hosted layout gallery review failed; local import deck remains available. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsHostedGalleryLoading(false);
    }
  }

  function loadPreferredLayout(rows: ControllerLayout[], nextType: ControllerType) {
    const preferred =
      rows.find((layout) => layout.gameId === gameId && layout.isDefault) ?? rows[0] ?? null;
    if (preferred) {
      setSelectedLayoutId(preferred.id);
      loadLayout(preferred);
    } else {
      resetDraft(nextType);
    }
  }

  function loadLayout(layout: ControllerLayout) {
    setName(layout.name);
    setControllerType(layout.controllerType);
    setTemplate(layout.template);
    setBindings(
      layout.bindings.length > 0
        ? cloneBindings(layout.bindings)
        : cloneBindings(DEFAULT_CONTROLLER_BINDINGS),
    );
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

  function buildDraftRuntimeLayout(): ControllerLayout {
    const now = new Date().toISOString();
    const trimmedName = name.trim() || makeDefaultName(gameTitle, controllerType);

    return {
      authorName: selectedLayout?.authorName ?? (isCommunity ? "OG Community" : "Local Browser"),
      bindings: cloneBindings(bindings),
      controllerType,
      createdAt: selectedLayout?.createdAt ?? now,
      gameId,
      gyroEnabled,
      hapticsEnabled,
      id:
        selectedLayout && !selectedLayout.isCommunity
          ? selectedLayout.id
          : `runtime-draft-${controllerType}`,
      isCommunity,
      isDefault,
      name: trimmedName,
      template,
      updatedAt: now,
      userId: selectedLayout?.userId ?? "local-controller-user",
    };
  }

  async function handleApplyRuntime() {
    setIsRuntimeBusy(true);
    setRuntimeMessage(null);
    setRuntimeError(null);
    try {
      const nextStatus = await applyControllerLayout({
        gameId: gameId ?? CONTROLLER_RUNTIME_PREVIEW_GAME_ID,
        layout: buildDraftRuntimeLayout(),
      });
      onRuntimeStatusChange?.(nextStatus);
      setRuntimeMessage(
        `Runtime staged for ${nextStatus.activeLayoutName ?? "controller layout"}. Desktop bridge only; no driver install, gyro/haptics output, or anti-cheat compatibility claim.`,
      );
    } catch (err) {
      setRuntimeError(
        `Desktop controller bridge required to apply this runtime layout. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsRuntimeBusy(false);
    }
  }

  async function handleClearRuntime() {
    setIsRuntimeBusy(true);
    setRuntimeMessage(null);
    setRuntimeError(null);
    try {
      const nextStatus = await clearControllerLayout();
      onRuntimeStatusChange?.(nextStatus);
      setRuntimeMessage("Controller runtime cleared from the local desktop bridge.");
    } catch (err) {
      setRuntimeError(
        `Desktop controller bridge required to clear the runtime layout. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsRuntimeBusy(false);
    }
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
      if (isLocalFallback) {
        const saved = createLocalControllerLayout({
          bindings,
          controllerType,
          gameId,
          gyroEnabled,
          hapticsEnabled,
          id: selectedLayout?.isCommunity ? undefined : selectedLayout?.id,
          isCommunity,
          isDefault,
          name: name.trim() || makeDefaultName(gameTitle, controllerType),
          template,
        });
        upsertStoredControllerLayout(saved);
        setLayouts(getLocalControllerLayouts(controllerType, gameId));
        setSelectedLayoutId(saved.id);
        loadLayout(saved);
        setMessage("Controller layout saved locally in this browser. Connect Supabase to share.");
        return;
      }

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
      setMessage(
        isCommunity
          ? "Layout saved as a pending community review draft."
          : "Controller layout saved.",
      );
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
      if (isLocalFallback) {
        removeStoredControllerLayout(selectedLayout.id);
        setLayouts((current) => current.filter((layout) => layout.id !== selectedLayout.id));
        resetDraft(controllerType);
        setMessage("Local controller layout removed from this session.");
        return;
      }

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
    setBindings((current) =>
      current.map((binding, i) => (i === index ? { ...binding, output } : binding)),
    );
  }

  async function handleImportCommunityTemplate(item: CommunityLayoutTemplate) {
    setMessage(null);
    setError(null);

    if (isLocalFallback) {
      const imported = createLocalControllerLayout({
        bindings: item.bindings,
        controllerType,
        gameId,
        gyroEnabled: item.gyroEnabled,
        hapticsEnabled: item.hapticsEnabled,
        id: `local-import-${item.id}-${controllerType}-${Date.now()}`,
        isCommunity: false,
        isDefault: false,
        name: `${item.name} Import`,
        template: item.template,
      });
      upsertStoredControllerLayout(imported);
      const rows = getLocalControllerLayouts(controllerType, gameId);
      setLayouts(rows);
      setSelectedLayoutId(imported.id);
      loadLayout(imported);
      setMessage(`${item.name} imported to local editable layouts.`);
      return;
    }

    if (item.source === "hosted") {
      setHostedActionBusyId(item.id);
      setHostedGalleryError(null);
      const downloadResult = await recordHostedControllerLayoutDownload(item.id);
      setHostedActionBusyId(null);

      if (downloadResult.ok) {
        updateHostedCommunityLayout(item.id, {
          downloads: downloadResult.value.downloadCount,
        });
        setHostedGalleryMessage(`${item.name} hosted download counter staged.`);
      } else {
        setHostedGalleryError(
          `${downloadResult.message} Draft import remains local until hosted review actions recover.`,
        );
      }
    }

    setSelectedLayoutId("new");
    setName(`${item.name} ${item.source === "hosted" ? "Hosted" : ""} Import`.replace("  ", " "));
    setTemplate(item.template);
    setBindings(cloneBindings(item.bindings));
    setGyroEnabled(item.gyroEnabled);
    setHapticsEnabled(item.hapticsEnabled);
    setIsCommunity(false);
    setIsDefault(false);
    setMessage(
      item.source === "hosted"
        ? `${item.name} loaded from the approved hosted feed as a local draft.`
        : `${item.name} loaded as a local draft. Save Layout to keep it.`,
    );
  }

  async function handleToggleCommunityVote(item: CommunityLayoutTemplate) {
    setError(null);
    setMessage(null);
    setHostedGalleryError(null);

    if (item.source === "hosted") {
      const nextVote = item.userVote === 1 ? 0 : 1;
      setHostedActionBusyId(item.id);
      const result = await setHostedControllerLayoutVote(item.id, nextVote);
      setHostedActionBusyId(null);

      if (!result.ok) {
        setHostedGalleryError(result.message);
        return;
      }

      updateHostedCommunityLayout(item.id, {
        userVote: result.value.userVote,
        votes: result.value.voteScore,
      });
      setHostedGalleryMessage(
        result.value.userVote === 0
          ? `Hosted vote removed from ${item.name}. Approved feed ranking is staged.`
          : `Staged hosted vote recorded for ${item.name}. Approved feed ranking is staged.`,
      );
      return;
    }

    const wasVoted = localCommunityVotes.has(item.id);

    setLocalCommunityVotes((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      writeStoredCommunityVoteIds(next);
      return next;
    });

    setMessage(
      wasVoted
        ? `Local vote removed from ${item.name}. Hosted ranking remains disabled.`
        : `Local vote added to ${item.name}. Hosted ranking remains disabled.`,
    );
  }

  async function handleReportCommunityTemplate(item: CommunityLayoutTemplate) {
    if (item.source !== "hosted") return;

    setMessage(null);
    setError(null);
    setHostedGalleryError(null);
    setHostedActionBusyId(item.id);
    const result = await reportHostedControllerLayout(item.id, "Controller layout gallery report");
    setHostedActionBusyId(null);

    if (!result.ok) {
      setHostedGalleryError(result.message);
      return;
    }

    updateHostedCommunityLayout(item.id, {
      reportCount: result.value.reportCount,
    });
    setHostedGalleryMessage(
      result.value.moderationStatus === "pending"
        ? `${item.name} moved back to pending moderation after report threshold.`
        : `${item.name} report stored for hosted moderation review.`,
    );
  }

  function updateHostedCommunityLayout(id: string, patch: Partial<CommunityLayoutTemplate>) {
    setHostedCommunityLayouts((current) =>
      current.map((layout) => (layout.id === id ? { ...layout, ...patch } : layout)),
    );
  }

  return (
    <section className="border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Steam Input Style
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Gamepad2 className="h-8 w-8" /> Controller Layouts
          </h2>
          <p className="neo-copy mt-2 max-w-2xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Detect pads, choose per-game layouts, remap buttons, save global defaults and submit
            community presets for review.
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
            <div
              key={device.id}
              className="border-2 border-black bg-[#f4ead8] p-3 shadow-[3px_3px_0_#171411]"
            >
              <p className="neo-copy text-[11px] font-black uppercase text-[#171411]">
                {device.name}
              </p>
              <p className="neo-copy mt-1 text-[10px] font-bold uppercase text-[#5f574d]">
                {device.controllerType} · {device.source} ·{" "}
                {device.isConnected ? "connected" : "offline"}
              </p>
              {device.powerLevel ? (
                <p className="neo-copy mt-2 inline-block border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
                  Power {device.powerLevel}
                </p>
              ) : null}
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

      <CommunityLayoutGallery
        controllerType={controllerType}
        hostedActionBusyId={hostedActionBusyId}
        isHostedGalleryLoading={isHostedGalleryLoading}
        items={hostedCommunityLayouts.length > 0 ? hostedCommunityLayouts : communityLayoutGallery}
        localVotes={localCommunityVotes}
        status={
          hostedCommunityLayouts.length > 0
            ? "hosted"
            : isSupabaseConfigured
              ? "hosted-empty"
              : "local"
        }
        statusError={hostedGalleryError}
        statusMessage={hostedGalleryMessage}
        onImport={handleImportCommunityTemplate}
        onReport={handleReportCommunityTemplate}
        onToggleVote={handleToggleCommunityVote}
      />

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
                <option key={type} value={type}>
                  {type}
                </option>
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
                  {layout.name}
                  {layout.isCommunity ? " · community" : layout.gameId ? " · game" : " · global"}
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
                <span className="neo-copy block text-[11px] font-black uppercase">
                  {item.label}
                </span>
                <span className="neo-copy mt-1 block text-[10px] font-bold uppercase opacity-80">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div>
          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              className={`neo-copy border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${gyroEnabled ? "bg-[#087d6d] text-white" : "bg-[#efe3cf]"}`}
              onClick={() => setGyroEnabled((value) => !value)}
            >
              Gyro {gyroEnabled ? "On" : "Off"}
            </button>
            <button
              type="button"
              className={`neo-copy border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${hapticsEnabled ? "bg-[#087d6d] text-white" : "bg-[#efe3cf]"}`}
              onClick={() => setHapticsEnabled((value) => !value)}
            >
              Haptics {hapticsEnabled ? "On" : "Off"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {bindings.map((binding, index) => (
              <label
                key={binding.input}
                className="grid gap-1 border-2 border-black bg-[#f4ead8] p-2"
              >
                <span className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
                  {binding.input}
                </span>
                <select
                  className="neo-copy h-9 border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold uppercase"
                  value={binding.output}
                  onChange={(event) => updateBinding(index, event.target.value)}
                >
                  {CONTROLLER_OUTPUTS.map((input) => (
                    <option key={input} value={input}>
                      {input}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={`neo-copy flex items-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${isDefault ? "bg-[#007166] text-white" : "bg-[#efe3cf]"}`}
              onClick={() => setIsDefault((value) => !value)}
            >
              Default {isDefault ? "On" : "Off"}
            </button>
            <button
              type="button"
              className={`neo-copy flex items-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${isCommunity ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"}`}
              onClick={() => setIsCommunity((value) => !value)}
            >
              <Share2 className="h-4 w-4" /> Community
            </button>
            <button
              type="button"
              className="neo-copy flex items-center gap-2 border-2 border-black bg-[#087d6d] px-4 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411]"
              onClick={() => void handleSave()}
              disabled={isLoading}
            >
              <Save className="h-4 w-4" /> Save Layout
            </button>
            <button
              type="button"
              className="neo-copy flex items-center gap-2 border-2 border-black bg-[#b7102a] px-3 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-45"
              onClick={() => void handleDelete()}
              disabled={!selectedLayout || selectedLayout.isCommunity || isLoading}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>

          <section
            aria-label="Controller runtime activation"
            className="mt-4 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
              <div>
                <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
                  Desktop Runtime Slot
                </p>
                <h3 className="neo-title mt-1 flex items-center gap-2 text-2xl uppercase text-[#171411]">
                  <Power aria-hidden="true" className="h-6 w-6" /> Apply Layout
                </h3>
              </div>
              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]">
                Target {gameId ?? CONTROLLER_RUNTIME_PREVIEW_GAME_ID}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="border-2 border-black bg-[#f4ead8] p-2">
                <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">
                  Active Layout
                </p>
                <p className="neo-copy mt-1 text-[11px] font-black uppercase text-[#171411]">
                  {runtimeStatus?.activeLayoutName ?? "No active runtime"}
                </p>
              </div>
              <div className="border-2 border-black bg-[#f4ead8] p-2">
                <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">Template</p>
                <p className="neo-copy mt-1 text-[11px] font-black uppercase text-[#171411]">
                  {runtimeStatus?.activeTemplate ?? "Idle"}
                </p>
              </div>
              <div className="border-2 border-black bg-[#f4ead8] p-2">
                <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">Config</p>
                <p className="neo-copy mt-1 break-all text-[10px] font-black uppercase text-[#171411]">
                  {runtimeStatus?.configPath ?? "Desktop app required"}
                </p>
              </div>
            </div>

            <p className="neo-copy mt-3 border-2 border-black bg-[#efe3cf] p-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
              Local runtime activation only. ViGEm/kernel driver install, gyro/haptics output, and
              anti-cheat compatibility are not claimed here.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="neo-copy flex items-center gap-2 border-2 border-black bg-[#087d6d] px-3 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-45"
                onClick={() => void handleApplyRuntime()}
                disabled={isRuntimeBusy}
              >
                <Power className="h-4 w-4" /> Apply Runtime
              </button>
              <button
                type="button"
                className="neo-copy flex items-center gap-2 border-2 border-black bg-[#b7102a] px-3 py-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-45"
                onClick={() => void handleClearRuntime()}
                disabled={isRuntimeBusy}
              >
                <Trash2 className="h-4 w-4" /> Clear Runtime
              </button>
            </div>

            {runtimeMessage ? (
              <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] p-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411]">
                {runtimeMessage}
              </p>
            ) : null}
            {runtimeError ? (
              <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-2 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411]">
                {runtimeError}
              </p>
            ) : null}
          </section>

          {message ? (
            <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] p-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411]">
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              className={`neo-copy mt-3 border-2 border-black p-2 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] ${
                isLocalFallback ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#b7102a] text-white"
              }`}
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function hostedLayoutToCommunityTemplate(layout: ControllerLayout): CommunityLayoutTemplate {
  const scopeTag = layout.gameId ? "Game" : "Global";

  return {
    authorName: layout.authorName ?? "Hosted Community",
    bindings:
      layout.bindings.length > 0
        ? cloneBindings(layout.bindings)
        : cloneBindings(DEFAULT_CONTROLLER_BINDINGS),
    description: `${layout.name} is an approved hosted ${layout.controllerType} preset from the community feed.`,
    downloads: layout.downloadCount ?? 0,
    gyroEnabled: layout.gyroEnabled,
    hapticsEnabled: layout.hapticsEnabled,
    id: layout.id,
    name: layout.name,
    reportCount: layout.reportCount ?? 0,
    source: "hosted",
    tags: ["Hosted", scopeTag, layout.controllerType],
    template: layout.template,
    userVote: layout.userVote ?? 0,
    votes: layout.voteScore ?? 0,
  };
}

function CommunityLayoutGallery({
  controllerType,
  hostedActionBusyId,
  isHostedGalleryLoading,
  items,
  localVotes,
  status,
  statusError,
  statusMessage,
  onImport,
  onReport,
  onToggleVote,
}: {
  controllerType: ControllerType;
  hostedActionBusyId: string | null;
  isHostedGalleryLoading: boolean;
  items: CommunityLayoutTemplate[];
  status: "hosted" | "hosted-empty" | "local";
  localVotes: Set<string>;
  statusError: string | null;
  statusMessage: string | null;
  onImport: (item: CommunityLayoutTemplate) => void | Promise<void>;
  onReport: (item: CommunityLayoutTemplate) => void | Promise<void>;
  onToggleVote: (item: CommunityLayoutTemplate) => void | Promise<void>;
}) {
  const rankedItems = [...items].sort((left, right) => {
    const rightVotes = getDisplayedVoteCount(right, localVotes);
    const leftVotes = getDisplayedVoteCount(left, localVotes);
    return rightVotes - leftVotes || left.name.localeCompare(right.name);
  });
  const isHosted = status === "hosted";

  return (
    <section
      aria-label="Community layout gallery"
      className="mt-4 border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
            Community Layout Gallery
          </p>
          <h3 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Users aria-hidden="true" className="h-7 w-7" /> Import Deck
          </h3>
          <p className="neo-copy mt-2 max-w-2xl text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            {isHosted
              ? "Approved hosted rows use Supabase votes, download counters, reports, and ranked feed order. Local import remains the editable fallback."
              : status === "hosted-empty"
                ? "Approved hosted gallery review is staged, but no approved rows matched this controller. Local import deck remains available."
                : "Local vote ledger fallback. Hosted vote persistence, ranking, and moderation contracts are staged; connect Supabase to review approved-feed rows."}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]">
          {isHostedGalleryLoading ? "Reviewing" : isHosted ? "Hosted Review" : "Target"}{" "}
          {controllerType}
        </span>
      </div>

      {statusMessage ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] p-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411]">
          {statusMessage}
        </p>
      ) : null}
      {statusError ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#b7102a] p-2 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411]">
          {statusError}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {rankedItems.map((item) => {
          const isVoted = item.source === "hosted" ? item.userVote === 1 : localVotes.has(item.id);
          const displayedVotes = getDisplayedVoteCount(item, localVotes);
          const isBusy = hostedActionBusyId === item.id;

          return (
            <article
              className="flex min-h-full flex-col border-2 border-black bg-[#f4ead8] p-3 shadow-[3px_3px_0_#171411]"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-base font-black uppercase text-[#171411]">
                    {item.name}
                  </h4>
                  <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#5f574d]">
                    {item.authorName}
                  </p>
                </div>
                <span className="neo-copy shrink-0 border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-black uppercase text-[#fff9ed]">
                  {item.source === "hosted" ? "Hosted" : item.template}
                </span>
              </div>
              <p className="neo-copy mt-3 flex-1 text-[10px] font-bold uppercase leading-5 text-[#5f574d]">
                {item.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span
                    className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase text-[#171411]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  aria-label={`${isVoted ? "Remove" : "Add"} ${item.source} vote for ${item.name}`}
                  aria-pressed={isVoted}
                  className={`neo-copy flex items-center gap-1 border-2 border-black px-2 py-1 text-[10px] font-black uppercase text-[#171411] ${
                    isVoted ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
                  }`}
                  disabled={isBusy}
                  type="button"
                  onClick={() => void onToggleVote(item)}
                >
                  <Star
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-[#c20b2f]"
                    fill={isVoted ? "currentColor" : "none"}
                  />{" "}
                  {displayedVotes}{" "}
                  {isVoted ? (item.source === "hosted" ? "Hosted Vote" : "Local Vote") : "Vote"}
                </button>
                <span className="neo-copy flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase text-[#171411]">
                  <Download aria-hidden="true" className="h-3.5 w-3.5 text-[#087d6d]" />{" "}
                  {item.downloads}
                </span>
              </div>
              <button
                className="neo-copy mt-3 flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] hover:-translate-y-0.5"
                type="button"
                disabled={isBusy}
                onClick={() => void onImport(item)}
              >
                <Download aria-hidden="true" className="h-4 w-4" /> Import
              </button>
              {item.source === "hosted" ? (
                <button
                  aria-label={`Report hosted layout ${item.name}`}
                  className="neo-copy mt-2 flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#efe3cf] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#f3d35b]"
                  disabled={isBusy}
                  type="button"
                  onClick={() => void onReport(item)}
                >
                  <Flag aria-hidden="true" className="h-3.5 w-3.5 text-[#b7102a]" /> Report
                  {item.reportCount ? ` ${item.reportCount}` : ""}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getDisplayedVoteCount(item: CommunityLayoutTemplate, localVotes: Set<string>) {
  if (item.source === "hosted") return item.votes;
  return item.votes + (localVotes.has(item.id) ? 1 : 0);
}

function readStoredCommunityVoteIds(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(LOCAL_CONTROLLER_LAYOUT_VOTES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeStoredCommunityVoteIds(votes: Set<string>) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    LOCAL_CONTROLLER_LAYOUT_VOTES_KEY,
    JSON.stringify(Array.from(votes).sort()),
  );
}

function getLocalControllerLayouts(
  controllerType: ControllerType,
  gameId: string | null,
): ControllerLayout[] {
  const stored = readStoredControllerLayouts().filter((layout) =>
    isLayoutInScope(layout, controllerType, gameId),
  );
  const storedIds = new Set(stored.map((layout) => layout.id));
  const seeds = createSeedControllerLayouts(controllerType, gameId).filter(
    (layout) => !storedIds.has(layout.id),
  );

  return [...stored, ...seeds];
}

function createSeedControllerLayouts(
  controllerType: ControllerType,
  gameId: string | null,
): ControllerLayout[] {
  return [
    createLocalControllerLayout({
      bindings: DEFAULT_CONTROLLER_BINDINGS.map((binding) =>
        binding.input === "LT / L2"
          ? { ...binding, output: "Left Shift" }
          : binding.input === "RT / R2"
            ? { ...binding, output: "Mouse Left" }
            : binding,
      ),
      controllerType,
      gameId,
      gyroEnabled: true,
      hapticsEnabled: true,
      id: `local-${controllerType}-default`,
      isCommunity: false,
      isDefault: true,
      name: `${controllerType} Local Default`,
      template: "gamepadGyro",
    }),
    createLocalControllerLayout({
      bindings: DEFAULT_CONTROLLER_BINDINGS,
      controllerType,
      gameId: null,
      gyroEnabled: false,
      hapticsEnabled: true,
      id: `local-${controllerType}-community`,
      isCommunity: true,
      isDefault: false,
      name: "Community Arcade Preset",
      template: "keyboardMouse",
    }),
  ];
}

function isLayoutInScope(
  layout: ControllerLayout,
  controllerType: ControllerType,
  gameId: string | null,
) {
  if (layout.controllerType !== controllerType) return false;
  if (gameId) return layout.gameId === gameId || layout.gameId === null;
  return layout.gameId === null;
}

function readStoredControllerLayouts(): ControllerLayout[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_CONTROLLER_LAYOUTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter(isControllerLayout) : [];
  } catch {
    return [];
  }
}

function writeStoredControllerLayouts(layouts: ControllerLayout[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(LOCAL_CONTROLLER_LAYOUTS_KEY, JSON.stringify(layouts));
}

function upsertStoredControllerLayout(saved: ControllerLayout) {
  const withoutSaved = readStoredControllerLayouts().filter((layout) => layout.id !== saved.id);
  const next = (
    saved.isDefault
      ? withoutSaved.map((layout) =>
          layout.controllerType === saved.controllerType && layout.gameId === saved.gameId
            ? { ...layout, isDefault: false }
            : layout,
        )
      : withoutSaved
  ).concat(saved);
  writeStoredControllerLayouts(next);
}

function removeStoredControllerLayout(id: string) {
  writeStoredControllerLayouts(readStoredControllerLayouts().filter((layout) => layout.id !== id));
}

function isControllerLayout(value: unknown): value is ControllerLayout {
  if (typeof value !== "object" || value === null) return false;

  const layout = value as Partial<ControllerLayout>;
  return (
    typeof layout.id === "string" &&
    typeof layout.userId === "string" &&
    (typeof layout.gameId === "string" || layout.gameId === null) &&
    typeof layout.name === "string" &&
    isControllerType(layout.controllerType) &&
    isControllerTemplate(layout.template) &&
    Array.isArray(layout.bindings) &&
    layout.bindings.every(isControllerBinding) &&
    typeof layout.gyroEnabled === "boolean" &&
    typeof layout.hapticsEnabled === "boolean" &&
    typeof layout.isCommunity === "boolean" &&
    typeof layout.isDefault === "boolean" &&
    (typeof layout.authorName === "string" || layout.authorName === null) &&
    typeof layout.createdAt === "string" &&
    typeof layout.updatedAt === "string"
  );
}

function isControllerType(value: unknown): value is ControllerType {
  return controllerTypes.includes(value as ControllerType);
}

function isControllerTemplate(value: unknown): value is ControllerTemplate {
  return templates.some((template) => template.value === value);
}

function isControllerBinding(value: unknown): value is ControllerMappingBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<ControllerMappingBinding>).input === "string" &&
    typeof (value as Partial<ControllerMappingBinding>).output === "string"
  );
}

function createLocalControllerLayout({
  bindings,
  controllerType,
  gameId,
  gyroEnabled,
  hapticsEnabled,
  id,
  isCommunity,
  isDefault,
  name,
  template,
}: {
  bindings: ControllerMappingBinding[];
  controllerType: ControllerType;
  gameId: string | null;
  gyroEnabled: boolean;
  hapticsEnabled: boolean;
  id?: string;
  isCommunity: boolean;
  isDefault: boolean;
  name: string;
  template: ControllerTemplate;
}): ControllerLayout {
  const now = new Date().toISOString();

  return {
    authorName: isCommunity ? "OG Community" : "Local Browser",
    bindings: cloneBindings(bindings),
    controllerType,
    createdAt: now,
    gameId,
    gyroEnabled,
    hapticsEnabled,
    id: id ?? `local-${controllerType}-${Date.now()}`,
    isCommunity,
    isDefault,
    name,
    template,
    updatedAt: now,
    userId: "local-controller-user",
  };
}
