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
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-sky-200">Social</p>
          <h1 className="text-4xl font-black text-white">Friends</h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric icon={<Users className="h-4 w-4" />} label="Friends" value={friends.length} />
          <Metric icon={<UserPlus className="h-4 w-4" />} label="Requests" value={requests.length} />
          <Metric icon={<Shield className="h-4 w-4" />} label="Blocked" value={0} />
        </div>
      </div>

      {isAuthLoading || isLoading ? (
        <div className="grid min-h-80 place-items-center border border-white/10 bg-white/[0.05]">
          <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
        </div>
      ) : !isConfigured ? (
        <Notice title="Supabase is not configured" body="Friends and requests need the public Supabase env vars." />
      ) : !user ? (
        <Notice title="Login required" body="Sign in before managing friends." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Panel title="Friend List">
              <FriendsList friends={friends} />
            </Panel>
            <Panel title="Friend Requests">
              <FriendRequestList requests={requests} />
              <div className="mt-4 space-y-2">
                {requests.map((request) => (
                  <div key={`${request.id}-actions`} className="flex flex-wrap gap-2">
                    <button
                      className="bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
                      disabled={isMutating}
                      type="button"
                      onClick={() => void runMutation(() => acceptFriendRequest(request.id), "Friend request accepted.")}
                    >
                      Accept {request.id.slice(0, 8)}
                    </button>
                    <button
                      className="border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.08] disabled:opacity-60"
                      disabled={isMutating}
                      type="button"
                      onClick={() => void runMutation(() => declineFriendRequest(request.id), "Friend request declined.")}
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Find Players">
              <UserSearch query={query} onQueryChange={setQuery} />
              <div className="mt-4 space-y-3">
                {isSearching ? (
                  <p className="text-sm text-slate-400">Searching...</p>
                ) : results.length > 0 ? (
                  results.map((profile) => (
                    <div key={profile.id} className="border border-white/10 bg-black/20 p-3">
                      <p className="font-bold text-white">{profile.displayName ?? profile.username}</p>
                      <p className="text-xs text-slate-500">@{profile.username}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
                          disabled={isMutating}
                          type="button"
                          onClick={() => void runMutation(() => sendFriendRequest(profile.id), "Friend request sent.")}
                        >
                          Add
                        </button>
                        <button
                          className="border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-100 hover:bg-rose-500/10 disabled:opacity-60"
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
                  <p className="text-sm text-slate-400">Search by username or display name.</p>
                )}
              </div>
            </Panel>
            <Panel title="Sent Requests / Blocklist">
              <p className="text-sm leading-6 text-slate-400">
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
    <div className="border border-white/10 bg-white/[0.05] px-4 py-3">
      <div className="flex items-center justify-center gap-2 text-sky-200">
        {icon}
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border border-white/10 bg-white/[0.05] p-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-6">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100" : "border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"}>
      {message}
    </div>
  );
}
