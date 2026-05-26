import { Loader2, Shield, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { FriendRequestList } from "../components/friends/FriendRequestList";
import { FriendsList } from "../components/friends/FriendsList";
import { UserSearch } from "../components/friends/UserSearch";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  acceptFriendRequest,
  blockUser,
  declineFriendRequest,
  getFriends,
  getMyFriendRequests,
  searchProfiles,
  sendFriendRequest,
} from "../lib/supabase/profile";
import type { FriendRequest, Friendship, Profile } from "../lib/types/profile";

export function FriendsPage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [loadedFriends, loadedRequests] = await Promise.all([
      getFriends(user.id),
      getMyFriendRequests(),
    ]);
    setFriends(loadedFriends);
    setRequests(loadedRequests);
  }, [user]);

  useEffect(() => {
    if (!isConfigured || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void refresh()
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setIsLoading(false));
  }, [isConfigured, refresh, user]);

  useEffect(() => {
    let isMounted = true;
    const trimmed = query.trim();

    if (!isConfigured || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void searchProfiles(trimmed)
        .then((profiles) => {
          if (isMounted) setResults(profiles.filter((profile) => profile.id !== user?.id));
        })
        .catch((error: unknown) => {
          if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [isConfigured, query, user?.id]);

  async function runMutation(action: () => Promise<unknown>, success: string) {
    setIsMutating(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            Social
          </p>
          <h1 className="neo-title mt-3 text-[clamp(3.8rem,13vw,6.5rem)] leading-[0.82] text-[#171411]">
            Friends
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric icon={<Users className="h-4 w-4" />} label="Friends" value={friends.length} />
          <Metric icon={<UserPlus className="h-4 w-4" />} label="Requests" value={requests.length} />
          <Metric icon={<Shield className="h-4 w-4" />} label="Blocked" value={0} />
        </div>
      </div>

      {isAuthLoading || isLoading ? (
        <div className="grid min-h-80 place-items-center border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <Loader2 className="h-8 w-8 animate-spin text-[#b7102a]" />
        </div>
      ) : !isConfigured ? (
        <Notice title="Supabase is not connected" body="Friends and requests require the public Supabase environment variables." />
      ) : !user ? (
        <Notice title="Login required" body="Sign in before managing friends." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Panel title="Friend List">
              <FriendsList currentUserId={user.id} friends={friends} />
            </Panel>
            <Panel title="Friend Requests">
              <FriendRequestList
                currentUserId={user.id}
                isMutating={isMutating}
                requests={requests}
                onAccept={(request) =>
                  void runMutation(() => acceptFriendRequest(request.id), "Friend request accepted.")
                }
                onDecline={(request) =>
                  void runMutation(() => declineFriendRequest(request.id), "Friend request declined.")
                }
              />
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Find Players">
              <UserSearch query={query} onQueryChange={setQuery} />
              <div className="mt-4 space-y-3">
                {isSearching ? (
                  <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                    Searching...
                  </p>
                ) : results.length > 0 ? (
                  results.map((profile) => (
                    <div
                      key={profile.id}
                      className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                    >
                      <p className="neo-title text-2xl leading-none text-[#171411]">
                        {profile.displayName ?? profile.username}
                      </p>
                      <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                        @{profile.username}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
                          disabled={isMutating}
                          type="button"
                          onClick={() => void runMutation(() => sendFriendRequest(profile.id), "Friend request sent.")}
                        >
                          Add
                        </button>
                        <button
                          className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
                          disabled={isMutating}
                          type="button"
                          onClick={() => void runMutation(() => blockUser(profile.id), "User blocked.")}
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                    Search by username or display name.
                  </p>
                )}
              </div>
            </Panel>
            <Panel title="Sent Requests / Blocklist">
              <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                MVP placeholder. The tables and RLS policies exist; a dedicated
                sent-request and blocklist query can be added when the social
                inbox design is finalized.
              </p>
            </Panel>
            {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
            {message ? <Status tone="success" message={message} /> : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-center gap-2 text-[#b7102a]">
        {icon}
        <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
        {value}
      </p>
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="relative border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
      <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border-4 border-black bg-[#fff9ed] p-6 shadow-[6px_6px_0_#171411]">
      <h2 className="neo-title text-4xl leading-none text-[#171411]">{title}</h2>
      <p className="neo-copy mt-3 text-[12px] font-bold uppercase leading-6 text-[#5b403f]">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]" : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"}>
      {message}
    </div>
  );
}
