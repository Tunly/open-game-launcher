/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDown, ArrowUp, PackagePlus, Power, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listMods, addMod, updateMod, deleteMod, swapModOrder, listModProfiles, createModProfile } from "../lib/supabase/mods";
import type { ManagedMod, ModProfile, ModSource } from "../lib/types/mods";

function sourceLabel(source: ModSource) {
  if (source === "steam_workshop") return "Steam Workshop";
  if (source === "nexus") return "Nexus";
  if (source === "local") return "Local Folder";
  return "Manual";
}

export function ModsPage() {
  const [mods, setMods] = useState<ManagedMod[]>([]);
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState("");
  const [name, setName] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [source, setSource] = useState<ModSource>("manual");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { loadMods(); }, [activeProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMods() {
    try { setLoading(true); setError("");
      const all = await listMods();
      setMods(all.filter(m => !activeProfile || m.profileId === activeProfile || (!m.profileId && activeProfile === "Default")));
      const profs = await listModProfiles("global");
      setProfiles(profs);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!name || !gameTitle) return;
    try { setError("");
      const gameId = gameTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await addMod({ gameTitle, name, source, sourceUrl: sourceUrl || undefined, gameId, profileId: activeProfile || undefined });
      setName(""); setGameTitle(""); setSourceUrl("");
      await loadMods();
    } catch (e: any) { setError(e.message); }
  }

  async function handleToggle(mod: ManagedMod) {
    await updateMod(mod.id, { enabled: !mod.enabled });
    await loadMods();
  }
  async function handleDelete(mod: ManagedMod) {
    await deleteMod(mod.id);
    await loadMods();
  }
  async function handleMoveUp(mod: ManagedMod) {
    const idx = mods.findIndex(m => m.id === mod.id);
    if (idx <= 0) return;
    await swapModOrder(mod.id, mods[idx - 1].id);
    await loadMods();
  }
  async function handleMoveDown(mod: ManagedMod) {
    const idx = mods.findIndex(m => m.id === mod.id);
    if (idx >= mods.length - 1) return;
    await swapModOrder(mod.id, mods[idx + 1].id);
    await loadMods();
  }
  async function handleCreateProfile() {
    if (!newProfileName) return;
    try {
      const p = await createModProfile(newProfileName, "global");
      if (p) { setActiveProfile(p.id); setNewProfileName(""); await loadMods(); }
    } catch (e: any) { setError(e.message); }
  }

  const profileFiltered = useMemo(() => {
    if (!activeProfile) return mods;
    return mods.filter(m => m.profileId === activeProfile || (!m.profileId && activeProfile === "Default"));
  }, [mods, activeProfile]);

  if (loading) return <div className="flex h-full items-center justify-center bg-[#fbf4e7]"><div className="border-4 border-black bg-[#f4ead8] px-5 py-3 font-black uppercase shadow-[6px_6px_0_#171411]">Loading Mods...</div></div>;

  return (
    <section className="flex flex-col gap-6 bg-[#fbf4e7] p-6">
      <div className="flex items-center gap-3">
        <PackagePlus className="h-8 w-8" />
        <h1 className="text-xl font-black uppercase">Mod Manager</h1>
      </div>
      {error && <div className="border-2 border-red-600 bg-red-100 p-2 text-sm font-bold text-red-800">{error}</div>}

      {/* Profile Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold uppercase">Profile:</span>
        <select className="border-2 border-black px-3 py-1 text-sm font-bold" value={activeProfile} onChange={e => setActiveProfile(e.target.value)}>
          <option value="">All Profiles</option>
          <option value="Default">Default</option>
          {profiles.filter(p => p.name !== "Default").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="border-2 border-black px-2 py-1 text-sm" placeholder="New profile" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
        <button onClick={handleCreateProfile} className="border-2 border-black bg-[#4CAF50] px-3 py-1 text-xs font-bold text-white shadow-[2px_2px_0_#171411]"><Save className="inline h-3 w-3 mr-1"/>Create</button>
      </div>

      {/* Add Mod Form */}
      <div className="flex flex-wrap items-end gap-3 border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
        <div><label className="text-xs font-bold uppercase">Game</label><input className="mt-1 border-2 border-black px-2 py-1 text-sm w-32" value={gameTitle} onChange={e => setGameTitle(e.target.value)} placeholder="Skyrim" /></div>
        <div><label className="text-xs font-bold uppercase">Mod Name</label><input className="mt-1 border-2 border-black px-2 py-1 text-sm w-40" value={name} onChange={e => setName(e.target.value)} placeholder="HD Textures" /></div>
        <div><label className="text-xs font-bold uppercase">Source</label><select className="mt-1 border-2 border-black px-2 py-1 text-sm" value={source} onChange={e => setSource(e.target.value as ModSource)}>
          {(["manual","steam_workshop","nexus","local"] as ModSource[]).map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}
        </select></div>
        <div><label className="text-xs font-bold uppercase">URL</label><input className="mt-1 border-2 border-black px-2 py-1 text-sm w-48" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..." /></div>
        <button onClick={handleAdd} className="border-2 border-black bg-[#FF9800] px-4 py-1 text-sm font-bold text-white shadow-[2px_2px_0_#171411]"><PackagePlus className="inline h-4 w-4 mr-1"/>Add</button>
      </div>

      {/* Mod List */}
      <div className="flex flex-col gap-2">
        {profileFiltered.length === 0 && <p className="text-sm text-gray-500">No mods installed. Add one above.</p>}
        {profileFiltered.map((mod) => (
          <div key={mod.id} className={`flex items-center gap-3 border-2 border-black p-3 ${mod.enabled ? "bg-white" : "bg-gray-200 opacity-60"}`}>
            <div className="flex flex-col gap-1">
              <button onClick={() => handleMoveUp(mod)} className="border border-black p-0.5"><ArrowUp className="h-3 w-3" /></button>
              <button onClick={() => handleMoveDown(mod)} className="border border-black p-0.5"><ArrowDown className="h-3 w-3" /></button>
            </div>
            <span className="text-xs font-bold text-gray-500 w-6 text-center">{mod.loadOrder}</span>
            <div className="flex-1">
              <div className="font-bold text-sm">{mod.name} <span className="text-xs text-gray-500">({mod.gameTitle})</span></div>
              <div className="text-xs text-gray-500">{sourceLabel(mod.source)}</div>
            </div>
            <button onClick={() => handleToggle(mod)} className={`border-2 border-black px-3 py-1 text-xs font-bold ${mod.enabled ? "bg-[#4CAF50] text-white" : "bg-gray-400 text-white"}`}>
              <Power className="inline h-3 w-3 mr-1"/>{mod.enabled ? "On" : "Off"}
            </button>
            <button onClick={() => handleDelete(mod)} className="border-2 border-red-600 px-2 py-1 text-xs font-bold text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
