import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Copy,
  Gamepad2,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  createFamilyGroup,
  getMyFamilyGroup,
  joinFamilyGroup,
  listFamilyMembers,
  listFamilySharedGames,
} from "../lib/supabase/family";
import type { FamilyGroup, FamilyMember, FamilySharedGame } from "../lib/types/family";

const fieldClass =
  "neo-copy mt-2 w-full border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[12px] font-black uppercase text-[#171411] outline-none shadow-[2px_2px_0_#171411] placeholder:text-[#655f58] focus:bg-[#f6edd8]";

const relayCards: { icon: LucideIcon; label: string; value: string }[] = [
  { icon: Shield, label: "Borrow Gate", value: "Owner locked" },
  { icon: Users, label: "Seats", value: "6 max" },
  { icon: Gamepad2, label: "Library", value: "Shared pool" },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function compactGameId(gameId: string): string {
  return gameId.length > 12 ? `${gameId.slice(0, 10)}...` : gameId;
}

function RelayCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-center justify-between gap-3">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
          {label}
        </p>
        <Icon className="h-5 w-5 text-[#b7102a]" />
      </div>
      <p className="neo-title mt-3 text-2xl leading-none text-[#171411]">{value}</p>
    </div>
  );
}

export function FamilyPage() {
  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [sharedGames, setSharedGames] = useState<FamilySharedGame[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const hydrateGroup = useCallback(async (nextGroup: FamilyGroup) => {
    const [nextMembers, nextSharedGames] = await Promise.all([
      listFamilyMembers(nextGroup.id),
      listFamilySharedGames(nextGroup.id),
    ]);
    setMembers(nextMembers);
    setSharedGames(nextSharedGames);
  }, []);

  const loadFamily = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const nextGroup = await getMyFamilyGroup();
      setGroup(nextGroup);
      if (nextGroup) {
        await hydrateGroup(nextGroup);
      } else {
        setMembers([]);
        setSharedGames([]);
      }
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [hydrateGroup]);

  useEffect(() => {
    void loadFamily();
  }, [loadFamily]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError("");
      setStatusMessage("");
      setIsCreating(true);
      const nextGroup = await createFamilyGroup(newName.trim() || "My Family");
      if (!nextGroup) {
        setError("Sign in and configure Supabase before creating a family relay.");
        return;
      }
      setGroup(nextGroup);
      setNewName("");
      await hydrateGroup(nextGroup);
      setStatusMessage(`Family relay created: ${nextGroup.name}`);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError("");
      setStatusMessage("");
      setIsJoining(true);
      const nextGroup = await joinFamilyGroup(inviteCode);
      if (!nextGroup) {
        setError("Sign in and configure Supabase before joining a family relay.");
        return;
      }
      setGroup(nextGroup);
      setInviteCode("");
      await hydrateGroup(nextGroup);
      setStatusMessage(`Joined family relay: ${nextGroup.name}`);
    } catch (joinError: unknown) {
      setError(getErrorMessage(joinError));
    } finally {
      setIsJoining(false);
    }
  }

  async function copyInviteCode() {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setStatusMessage(`Invite copied: ${group.inviteCode}`);
      setError("");
    } catch (copyError: unknown) {
      setError(getErrorMessage(copyError));
    }
  }

  if (loading) {
    return (
      <section className="neo-dots grid min-h-[520px] place-items-center">
        <div className="border-4 border-black bg-[#f4ead8] px-5 py-4 shadow-[6px_6px_0_#171411]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#087d6d]" />
            <p className="neo-copy text-[12px] font-black uppercase text-[#171411]">
              Loading family relay
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="neo-dots space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#000]">
              Household Link
            </span>
            <h1 className="neo-title mt-3 text-5xl leading-none md:text-7xl">Family Sharing</h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
              Create a private borrow relay for trusted players, shared libraries, and active seat
              checks.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {relayCards.map((card) => (
              <RelayCard key={card.label} {...card} />
            ))}
          </div>
        </div>

        <div className="hero-art relative min-h-[250px] overflow-hidden border-4 border-black p-4 shadow-[6px_6px_0_#171411]">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px]" />
          <div className="relative flex h-full min-h-[218px] flex-col justify-between">
            <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
              Seat Board
            </span>
            <div>
              <div className="mb-3 grid h-16 w-16 place-items-center border-[3px] border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#000]">
                <Users className="h-9 w-9" />
              </div>
              <h2 className="neo-title text-4xl leading-none text-[#fff9ed] [text-shadow:3px_3px_0_#171411]">
                Share Desk
              </h2>
              <p className="neo-copy mt-2 max-w-[280px] text-[10px] font-black uppercase leading-5 text-[#f5eedf]">
                Invite codes, member seats, and library borrow status stay on one launcher panel.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="neo-copy border-[3px] border-black bg-[#f5d6d9] p-3 text-[10px] font-black uppercase leading-5 text-[#77101f] shadow-[3px_3px_0_#171411]">
          {error}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="neo-copy border-[3px] border-black bg-[#8cf5e4] p-3 text-[10px] font-black uppercase leading-5 text-[#171411] shadow-[3px_3px_0_#171411]">
          {statusMessage}
        </div>
      ) : null}

      {!group ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]"
            onSubmit={handleCreate}
          >
            <div className="border-b-4 border-black bg-[#efe6d4] px-4 py-3">
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                New Relay
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">
                Create Family Group
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Family Name
                </span>
                <input
                  className={fieldClass}
                  placeholder="Arcade Household"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </label>
              <button
                className="neo-copy inline-flex h-11 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:bg-[#655f58]"
                disabled={isCreating}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                {isCreating ? "Creating" : "Create Relay"}
              </button>
            </div>
          </form>

          <form
            className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]"
            onSubmit={handleJoin}
          >
            <div className="border-b-4 border-black bg-[#efe6d4] px-4 py-3">
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#087d6d]">
                Invite Dock
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">
                Join Existing Family
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Invite Code
                </span>
                <input
                  className={fieldClass}
                  maxLength={8}
                  placeholder="ABCDEFGH"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                />
              </label>
              <button
                className="neo-copy inline-flex h-11 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:cursor-not-allowed disabled:bg-[#655f58]"
                disabled={isJoining || inviteCode.trim().length === 0}
                type="submit"
              >
                <KeyRound className="h-4 w-4" />
                {isJoining ? "Joining" : "Join Relay"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
              <div className="border-b-4 border-black bg-[#efe6d4] px-4 py-3">
                <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                  Active Relay
                </p>
                <h2 className="neo-title text-4xl leading-none text-[#171411]">{group.name}</h2>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
                  <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Members</p>
                  <p className="neo-title mt-2 text-3xl leading-none">
                    {members.length}/{group.maxMembers}
                  </p>
                </div>
                <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
                  <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Games</p>
                  <p className="neo-title mt-2 text-3xl leading-none">{sharedGames.length}</p>
                </div>
                <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
                  <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Created</p>
                  <p className="neo-copy mt-2 text-[11px] font-black uppercase">
                    {formatDate(group.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-4 border-black bg-[#171411] p-4 text-[#f5eedf] shadow-[6px_6px_0_#171411]">
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#8cf5e4]">
                Invite Code
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 border-2 border-[#f5eedf] bg-[#24201c] p-3">
                <span className="neo-title text-3xl leading-none">{group.inviteCode}</span>
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[#f5eedf] bg-[#087d6d] text-white shadow-[2px_2px_0_#000] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
                  onClick={() => {
                    void copyInviteCode();
                  }}
                  title="Copy invite code"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
              <div className="flex items-center gap-3 border-b-4 border-black bg-[#efe6d4] px-4 py-3">
                <Users className="h-6 w-6 text-[#087d6d]" />
                <h3 className="neo-title text-3xl leading-none text-[#171411]">Members</h3>
              </div>
              <div className="divide-y-4 divide-black">
                {members.length > 0 ? (
                  members.map((member, index) => (
                    <div
                      key={member.id}
                      className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 p-4"
                    >
                      <span className="neo-title text-3xl leading-none text-[#087d6d]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase text-[#171411]">
                          {member.userId}
                        </p>
                        <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#5b403f]">
                          Joined {formatDate(member.joinedAt)}
                        </p>
                      </div>
                      <span
                        className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                          member.role === "owner"
                            ? "bg-[#b7102a] text-white"
                            : "bg-[#fff9ed] text-[#171411]"
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="neo-copy p-4 text-[10px] font-black uppercase text-[#5b403f]">
                    No members synced yet.
                  </p>
                )}
              </div>
            </div>

            <div className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
              <div className="flex items-center gap-3 border-b-4 border-black bg-[#efe6d4] px-4 py-3">
                <Gamepad2 className="h-6 w-6 text-[#087d6d]" />
                <h3 className="neo-title text-3xl leading-none text-[#171411]">Shared Games</h3>
              </div>
              <div className="divide-y-4 divide-black">
                {sharedGames.length > 0 ? (
                  sharedGames.map((sharedGame) => (
                    <div
                      key={sharedGame.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase text-[#171411]">
                          {compactGameId(sharedGame.gameId)}
                        </p>
                        <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#5b403f]">
                          Shared {formatDate(sharedGame.sharedAt)}
                        </p>
                      </div>
                      <span
                        className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                          sharedGame.isAvailable
                            ? "bg-[#087d6d] text-white"
                            : "bg-[#b7102a] text-white"
                        }`}
                      >
                        {sharedGame.isAvailable ? "Available" : "In use"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="neo-copy p-4 text-[10px] font-black uppercase text-[#5b403f]">
                    No games shared yet. Share from Library.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
