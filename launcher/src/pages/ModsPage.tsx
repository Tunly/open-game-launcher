import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  PackagePlus,
  Power,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type ModSource = "manual" | "steam_workshop" | "nexus" | "local";

interface ManagedMod {
  id: string;
  name: string;
  gameTitle: string;
  source: ModSource;
  version: string;
  enabled: boolean;
  loadOrder: number;
  pathOrUrl: string;
  profile: string;
  installedAt: string;
}

const modsStorageKey = "og-launcher:mods:v1";
const profileStorageKey = "og-launcher:mod-profile:v1";

function readMods() {
  try {
    const rawValue = localStorage.getItem(modsStorageKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? (parsed as ManagedMod[]) : [];
  } catch {
    return [];
  }
}

function readActiveProfile() {
  return localStorage.getItem(profileStorageKey) ?? "Default";
}

function sourceLabel(source: ModSource) {
  if (source === "steam_workshop") return "Steam Workshop";
  if (source === "nexus") return "Nexus";
  if (source === "local") return "Local Folder";
  return "Manual";
}

export function ModsPage() {
  const [mods, setMods] = useState<ManagedMod[]>(readMods);
  const [activeProfile, setActiveProfile] = useState(readActiveProfile);
  const [newProfileName, setNewProfileName] = useState("");
  const [name, setName] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [source, setSource] = useState<ModSource>("manual");
  const [version, setVersion] = useState("1.0.0");
  const [pathOrUrl, setPathOrUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const profiles = useMemo(
    () => Array.from(new Set(["Default", ...mods.map((mod) => mod.profile)])).sort(),
    [mods],
  );
  const visibleMods = useMemo(
    () => mods.filter((mod) => mod.profile === activeProfile).sort((a, b) => a.loadOrder - b.loadOrder),
    [activeProfile, mods],
  );
  const conflicts = useMemo(() => findConflicts(visibleMods), [visibleMods]);
  const enabledCount = visibleMods.filter((mod) => mod.enabled).length;

  useEffect(() => {
    localStorage.setItem(modsStorageKey, JSON.stringify(mods));
  }, [mods]);

  useEffect(() => {
    localStorage.setItem(profileStorageKey, activeProfile);
  }, [activeProfile]);

  function addMod() {
    if (!name.trim() || !gameTitle.trim()) {
      setStatusMessage("Name and game title are required.");
      return;
    }

    const nextLoadOrder = visibleMods.reduce((max, mod) => Math.max(max, mod.loadOrder), 0) + 1;
    const nextMod: ManagedMod = {
      enabled: true,
      gameTitle: gameTitle.trim(),
      id: crypto.randomUUID(),
      installedAt: new Date().toISOString(),
      loadOrder: nextLoadOrder,
      name: name.trim(),
      pathOrUrl: pathOrUrl.trim(),
      profile: activeProfile,
      source,
      version: version.trim() || "1.0.0",
    };

    setMods((current) => [...current, nextMod]);
    setName("");
    setGameTitle("");
    setPathOrUrl("");
    setVersion("1.0.0");
    setStatusMessage("Mod added to the active profile.");
  }

  function toggleMod(modId: string) {
    setMods((current) =>
      current.map((mod) => (mod.id === modId ? { ...mod, enabled: !mod.enabled } : mod)),
    );
  }

  function removeMod(modId: string) {
    setMods((current) => current.filter((mod) => mod.id !== modId));
    setStatusMessage("Mod removed from the profile.");
  }

  function moveMod(modId: string, direction: -1 | 1) {
    const ordered = [...visibleMods];
    const index = ordered.findIndex((mod) => mod.id === modId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
      return;
    }

    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
    const orderById = new Map(ordered.map((mod, nextIndex) => [mod.id, nextIndex + 1]));
    setMods((current) =>
      current.map((mod) =>
        mod.profile === activeProfile
          ? { ...mod, loadOrder: orderById.get(mod.id) ?? mod.loadOrder }
          : mod,
      ),
    );
  }

  function createProfile() {
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      return;
    }
    setActiveProfile(trimmed);
    setNewProfileName("");
    setStatusMessage(`Profile "${trimmed}" is active.`);
  }

  function exportProfile() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), mods: visibleMods, profile: activeProfile }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeProfile.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-mods.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            Loadout
          </p>
          <h1 className="neo-title mt-3 text-[clamp(3.4rem,12vw,6rem)] leading-[0.82] text-[#171411]">
            Mods
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric icon={<PackagePlus className="h-4 w-4" />} label="Mods" value={visibleMods.length} />
          <Metric icon={<Power className="h-4 w-4" />} label="Enabled" value={enabledCount} />
          <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Conflicts" value={conflicts.length} />
        </div>
      </div>

      {statusMessage ? (
        <div className="neo-copy mb-5 border-[3px] border-black bg-[#8cf5e4] p-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[4px_4px_0_#171411]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
          <div className="flex flex-col gap-3 border-b-[3px] border-black pb-3 md:flex-row md:items-center md:justify-between">
            <h2 className="neo-title text-3xl leading-none text-[#171411]">
              Load Order
            </h2>
            <button
              className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#fff9ed] shadow-[2px_2px_0_#171411]"
              type="button"
              onClick={exportProfile}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {visibleMods.length > 0 ? (
              visibleMods.map((mod, index) => (
                <article
                  key={mod.id}
                  className={`border-[3px] border-black p-4 shadow-[3px_3px_0_#171411] ${
                    mod.enabled ? "bg-[#f6edd8]" : "bg-[#e3d5ba] opacity-80"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
                          #{mod.loadOrder}
                        </span>
                        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411]">
                          {sourceLabel(mod.source)}
                        </span>
                      </div>
                      <h3 className="neo-title mt-3 text-3xl leading-none text-[#171411]">{mod.name}</h3>
                      <p className="neo-copy mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                        {mod.gameTitle} / v{mod.version}
                      </p>
                      {mod.pathOrUrl ? (
                        <p className="mt-2 break-all text-xs font-bold leading-5 text-[#5b403f]">{mod.pathOrUrl}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <IconButton label="Move up" disabled={index === 0} onClick={() => moveMod(mod.id, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Move down" disabled={index === visibleMods.length - 1} onClick={() => moveMod(mod.id, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={mod.enabled ? "Disable mod" : "Enable mod"} onClick={() => toggleMod(mod.id)}>
                        {mod.enabled ? <CheckCircle2 className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </IconButton>
                      <IconButton label="Remove mod" tone="danger" onClick={() => removeMod(mod.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <p className="neo-copy border-[3px] border-dashed border-black bg-[#f6edd8] p-8 text-center text-[12px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                Add a mod to build a loadout for this profile.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
            <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
              Profile
            </h2>
            <div className="mt-4 grid gap-3">
              <select
                className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
                value={activeProfile}
                onChange={(event) => setActiveProfile(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile} value={profile}>{profile}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase text-[#171411] outline-none"
                  placeholder="New profile"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                />
                <button
                  className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#007166] text-white shadow-[2px_2px_0_#171411]"
                  type="button"
                  onClick={createProfile}
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
            <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
              Add Mod
            </h2>
            <div className="mt-4 grid gap-3">
              <TextInput label="Mod Name" value={name} onChange={setName} />
              <TextInput label="Game Title" value={gameTitle} onChange={setGameTitle} />
              <TextInput label="Version" value={version} onChange={setVersion} />
              <label className="grid gap-1">
                <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">Source</span>
                <select
                  className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none"
                  value={source}
                  onChange={(event) => setSource(event.target.value as ModSource)}
                >
                  <option value="manual">Manual</option>
                  <option value="steam_workshop">Steam Workshop</option>
                  <option value="nexus">Nexus</option>
                  <option value="local">Local Folder</option>
                </select>
              </label>
              <TextInput label="Path Or URL" value={pathOrUrl} onChange={setPathOrUrl} />
              <button
                className="neo-copy inline-flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411]"
                type="button"
                onClick={addMod}
              >
                <PackagePlus className="h-4 w-4" />
                Add To Loadout
              </button>
            </div>
          </section>

          <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
            <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
              Conflicts
            </h2>
            <div className="mt-4 space-y-2">
              {conflicts.length > 0 ? (
                conflicts.map((conflict) => (
                  <p key={conflict} className="neo-copy border-2 border-black bg-[#f2c14e] p-2 text-[10px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[2px_2px_0_#171411]">
                    {conflict}
                  </p>
                ))
              ) : (
                <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] font-black uppercase leading-5 text-[#655f58]">
                  No load-order conflicts detected.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function findConflicts(mods: ManagedMod[]) {
  const activeMods = mods.filter((mod) => mod.enabled);
  const conflicts: string[] = [];
  const byGameAndOrder = new Map<string, ManagedMod[]>();

  for (const mod of activeMods) {
    const key = `${mod.gameTitle.toLowerCase()}-${mod.loadOrder}`;
    byGameAndOrder.set(key, [...(byGameAndOrder.get(key) ?? []), mod]);
  }

  for (const group of byGameAndOrder.values()) {
    if (group.length > 1) {
      conflicts.push(`${group.length} mods share load slot ${group[0].loadOrder} for ${group[0].gameTitle}.`);
    }
  }

  const missingTargets = activeMods.filter((mod) => !mod.pathOrUrl.trim());
  if (missingTargets.length > 0) {
    conflicts.push(`${missingTargets.length} enabled mods have no path or source URL.`);
  }

  return conflicts;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-center gap-2 text-[#b7102a]">
        {icon}
        <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">{value}</p>
    </div>
  );
}

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "danger" | "default";
}) {
  return (
    <button
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center border-2 border-black shadow-[2px_2px_0_#171411] disabled:opacity-40 ${
        tone === "danger" ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
      }`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TextInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">{label}</span>
      <input
        className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase text-[#171411] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
