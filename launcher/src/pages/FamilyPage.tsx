/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Copy, Plus, Users, Gamepad2 } from "lucide-react";
import { createFamilyGroup, getMyFamilyGroup, joinFamilyGroup, listFamilyMembers, listFamilySharedGames } from "../lib/supabase/family";
import type { FamilyGroup, FamilyMember, FamilySharedGame } from "../lib/types/family";

export function FamilyPage() {
  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [sharedGames, setSharedGames] = useState<FamilySharedGame[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFamily(); }, []);
  async function loadFamily() {
    try {
      setLoading(true);
      const g = await getMyFamilyGroup();
      setGroup(g);
      if (g) {
        const [m, s] = await Promise.all([listFamilyMembers(g.id), listFamilySharedGames(g.id)]);
        setMembers(m); setSharedGames(s);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    try { setError(""); const g = await createFamilyGroup(newName || "My Family"); setGroup(g); setNewName(""); if (g) { const [m, s] = await Promise.all([listFamilyMembers(g.id), listFamilySharedGames(g.id)]); setMembers(m); setSharedGames(s); } }
    catch (e: any) { setError(e.message); }
  }
  async function handleJoin() {
    try { setError(""); const g = await joinFamilyGroup(inviteCode); if (g) { setGroup(g); setInviteCode(""); const [m, s] = await Promise.all([listFamilyMembers(g.id), listFamilySharedGames(g.id)]); setMembers(m); setSharedGames(s); } }
    catch (e: any) { setError(e.message); }
  }

  if (loading) return <div className="flex h-full items-center justify-center bg-[#fbf4e7]"><div className="border-4 border-black bg-[#f4ead8] px-5 py-3 font-black uppercase shadow-[6px_6px_0_#171411]">Loading Family...</div></div>;

  return (
    <section className="flex flex-col gap-6 bg-[#fbf4e7] p-6">
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8" />
        <h1 className="text-xl font-black uppercase">Family Sharing</h1>
      </div>
      {error && <div className="border-2 border-red-600 bg-red-100 p-2 text-sm font-bold text-red-800">{error}</div>}
      {!group ? (
        <div className="flex flex-col gap-4 max-w-md">
          <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
            <h2 className="font-bold mb-2">Create Family Group</h2>
            <div className="flex gap-2">
              <input className="flex-1 border-2 border-black px-3 py-2 text-sm font-bold" placeholder="Family name" value={newName} onChange={e => setNewName(e.target.value)} />
              <button onClick={handleCreate} className="border-2 border-black bg-[#4CAF50] px-4 py-2 font-bold text-white shadow-[2px_2px_0_#171411]"><Plus className="inline h-4 w-4 mr-1"/>Create</button>
            </div>
          </div>
          <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
            <h2 className="font-bold mb-2">Join Existing Family</h2>
            <div className="flex gap-2">
              <input className="flex-1 border-2 border-black px-3 py-2 text-sm font-bold uppercase" placeholder="Invite code e.g. ABCDEFGH" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} maxLength={8} />
              <button onClick={handleJoin} className="border-2 border-black bg-[#FF9800] px-4 py-2 font-bold text-white shadow-[2px_2px_0_#171411]">Join</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="border-4 border-black bg-white px-4 py-2 shadow-[4px_4px_0_#171411]">
              <span className="text-sm font-bold uppercase">{group.name}</span>
              <span className="ml-2 text-xs text-gray-500">{members.length}/{group.maxMembers}</span>
            </div>
            <div className="flex items-center gap-2 border-4 border-black bg-[#f4ead8] px-3 py-1 shadow-[2px_2px_0_#171411]">
              <span className="text-xs font-bold uppercase">Invite: {group.inviteCode}</span>
              <button onClick={() => { navigator.clipboard.writeText(group.inviteCode); }} title="Copy invite code">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
              <h3 className="font-black uppercase mb-2"><Users className="inline h-4 w-4 mr-1"/> Members</h3>
              {members.map(m => (
                <div key={m.id} className="flex justify-between py-1 border-b border-gray-200 text-sm font-bold">
                  <span>{m.role === "owner" ? "👑 Owner" : "Member"}</span>
                </div>
              ))}
            </div>
            <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
              <h3 className="font-black uppercase mb-2"><Gamepad2 className="inline h-4 w-4 mr-1"/> Shared Games</h3>
              {sharedGames.map(sg => (
                <div key={sg.id} className="flex justify-between py-1 border-b border-gray-200 text-sm font-bold">
                  <span>{sg.gameId.slice(0, 8)}...</span>
                  {sg.isAvailable ? <span className="text-green-600">Available</span> : <span className="text-red-600">In use</span>}
                </div>
              ))}
              {sharedGames.length === 0 && <p className="text-sm text-gray-500">No games shared yet. Share from Library.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
