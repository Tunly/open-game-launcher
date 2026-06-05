import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import type { Game } from "../../../lib/types";
import { setCachedGamePlaytime } from "../../../lib/launcher";
import {
  listGameSessions,
  resolveCatalogGameId,
  updateGameSession,
  updateUserGamePlaytime,
  type GameSessionPatch,
  type GameSessionRow,
} from "../../../lib/supabase/playtime";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { getErrorMessage } from "../../../lib/formatters";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

const PAGE_SIZE = 10;

function formatHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) {
    return "0 hours";
  }
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null) {
    return "—";
  }
  const safe = Math.max(0, Math.floor(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return `${h}h ${m}m`;
}

function maskGameId(id: string): string {
  if (id.length <= 10) {
    return id;
  }
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function formatSessionTimeRange(session: GameSessionRow): string {
  const start = session.startedAt ? new Date(session.startedAt) : null;
  const end = session.endedAt ? new Date(session.endedAt) : null;
  const fmt = (date: Date | null) =>
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleString(undefined, {
          year: "2-digit",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  return `${fmt(start)} → ${fmt(end)}`;
}

interface PlaytimeEditorPanelProps {
  game: Game;
  onStatusMessage?: (message: string | null) => void;
  onPlaytimeChanged?: (nextMinutes: number) => void;
}

export function PlaytimeEditorPanel({
  game,
  onStatusMessage,
  onPlaytimeChanged,
}: PlaytimeEditorPanelProps) {
  const user = useCurrentUser();
  const userId = user?.session?.user?.id ?? null;
  const isSignedIn = Boolean(userId);

  const [page, setPage] = useState(0);
  const [sessions, setSessions] = useState<GameSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [catalogGameId, setCatalogGameId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [isEditTotalOpen, setIsEditTotalOpen] = useState(false);
  const [editTotalValue, setEditTotalValue] = useState<string>(String(game.playtimeMinutes ?? 0));
  const [isSavingTotal, setIsSavingTotal] = useState(false);
  const [editTotalError, setEditTotalError] = useState<string | null>(null);

  const [editingSession, setEditingSession] = useState<GameSessionRow | null>(null);
  const [sessionEditStartedAt, setSessionEditStartedAt] = useState("");
  const [sessionEditEndedAt, setSessionEditEndedAt] = useState("");
  const [sessionEditDuration, setSessionEditDuration] = useState("");
  const [sessionEditError, setSessionEditError] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<GameSessionRow | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (!isSignedIn) {
      setCatalogGameId(null);
      setCatalogError(null);
      return;
    }
    try {
      const next = await resolveCatalogGameId(game);
      if (!mountedRef.current) return;
      setCatalogGameId(next);
      setCatalogError(next ? null : "No catalog row for this game yet.");
    } catch (err) {
      if (!mountedRef.current) return;
      setCatalogGameId(null);
      setCatalogError(getErrorMessage(err));
    }
  }, [game, isSignedIn]);

  const refreshSessions = useCallback(async () => {
    if (!isSignedIn || !catalogGameId) {
      setSessions([]);
      setTotal(0);
      return;
    }
    setIsLoadingSessions(true);
    setSessionsError(null);
    try {
      const result = await listGameSessions(game, { page, pageSize: PAGE_SIZE });
      if (!mountedRef.current) return;
      setSessions(result.sessions);
      setTotal(result.total);
    } catch (err) {
      if (!mountedRef.current) return;
      setSessionsError(getErrorMessage(err));
      setSessions([]);
      setTotal(0);
    } finally {
      if (mountedRef.current) {
        setIsLoadingSessions(false);
      }
    }
  }, [catalogGameId, game, isSignedIn, page]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    setPage(0);
  }, [game.id]);

  const openEditTotal = useCallback(() => {
    setEditTotalValue(String(Math.max(0, Math.floor(game.playtimeMinutes ?? 0))));
    setEditTotalError(null);
    setIsEditTotalOpen(true);
  }, [game.playtimeMinutes]);

  const closeEditTotal = useCallback(() => {
    if (isSavingTotal) return;
    setIsEditTotalOpen(false);
  }, [isSavingTotal]);

  const handleSaveTotal = useCallback(async () => {
    const parsed = Number.parseInt(editTotalValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditTotalError("Enter a non-negative whole number of minutes.");
      return;
    }
    setIsSavingTotal(true);
    setEditTotalError(null);
    try {
      await setCachedGamePlaytime(game.id, parsed);
      if (userId && catalogGameId) {
        await updateUserGamePlaytime(userId, catalogGameId, parsed);
      }
      if (!mountedRef.current) return;
      onPlaytimeChanged?.(parsed);
      onStatusMessage?.("Playtime updated.");
      setIsEditTotalOpen(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setEditTotalError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) {
        setIsSavingTotal(false);
      }
    }
  }, [catalogGameId, editTotalValue, game.id, onPlaytimeChanged, onStatusMessage, userId]);

  const openEditSession = useCallback((session: GameSessionRow) => {
    setEditingSession(session);
    setSessionEditStartedAt(isoToDatetimeLocal(session.startedAt));
    setSessionEditEndedAt(isoToDatetimeLocal(session.endedAt));
    setSessionEditDuration(
      session.durationMinutes == null
        ? ""
        : String(Math.max(0, Math.floor(session.durationMinutes))),
    );
    setSessionEditError(null);
  }, []);

  const closeEditSession = useCallback(() => {
    if (isSavingSession) return;
    setEditingSession(null);
    setSessionEditError(null);
  }, [isSavingSession]);

  const handleSaveSession = useCallback(async () => {
    if (!editingSession) return;
    const startedIso = datetimeLocalToIso(sessionEditStartedAt);
    const endedIso = datetimeLocalToIso(sessionEditEndedAt);
    const durationParsed =
      sessionEditDuration.trim() === "" ? null : Number.parseInt(sessionEditDuration, 10);
    if (
      sessionEditDuration.trim() !== "" &&
      (!Number.isFinite(durationParsed) || (durationParsed ?? 0) < 0)
    ) {
      setSessionEditError("Duration must be a non-negative whole number of minutes.");
      return;
    }
    if (startedIso && endedIso) {
      const startMs = new Date(startedIso).getTime();
      const endMs = new Date(endedIso).getTime();
      if (endMs < startMs) {
        setSessionEditError("End time must be on or after start time.");
        return;
      }
    }
    if (!startedIso) {
      setSessionEditError("Start time is required.");
      return;
    }

    const patch: GameSessionPatch = {
      startedAt: startedIso,
      endedAt: endedIso,
      durationMinutes: durationParsed,
    };

    setIsSavingSession(true);
    setSessionEditError(null);
    try {
      await updateGameSession(editingSession.id, patch);
      if (!mountedRef.current) return;
      onStatusMessage?.("Session updated.");
      setEditingSession(null);
      await refreshSessions();
    } catch (err) {
      if (!mountedRef.current) return;
      setSessionEditError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) {
        setIsSavingSession(false);
      }
    }
  }, [
    editingSession,
    onStatusMessage,
    refreshSessions,
    sessionEditDuration,
    sessionEditEndedAt,
    sessionEditStartedAt,
  ]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeletingSession(true);
    setDeleteError(null);
    try {
      const { deleteGameSession } = await import("../../../lib/supabase/playtime");
      const ok = await deleteGameSession(pendingDelete.id);
      if (!mountedRef.current) return;
      if (!ok) {
        setDeleteError("Could not delete the session.");
        return;
      }
      onStatusMessage?.("Session deleted.");
      setPendingDelete(null);
      const nextPage = sessions.length === 1 && page > 0 ? page - 1 : page;
      setPage(nextPage);
      await refreshSessions();
    } catch (err) {
      if (!mountedRef.current) return;
      setDeleteError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) {
        setIsDeletingSession(false);
      }
    }
  }, [onStatusMessage, page, pendingDelete, refreshSessions, sessions.length]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <section className="border-2 border-black bg-[#fff9ed] shadow-[3px_3px_0_#1f1c0f]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#fbf4e7] px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-[#087d6d]" />
          <h2 className="neo-title text-[15px] uppercase leading-none text-[#171411]">
            Play Time Correction
          </h2>
        </div>
        <span className="neo-copy border-2 border-black bg-[#f3e8d7] px-2 py-0.5 text-[10px] font-black uppercase text-[#55504a]">
          {formatHours(game.playtimeMinutes)}
        </span>
      </header>

      <div className="space-y-3 p-3 text-[12px] font-bold leading-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
              Current Total
            </p>
            <p className="neo-title text-2xl uppercase leading-none text-[#171411]">
              {formatHours(game.playtimeMinutes)}
            </p>
          </div>
          <button
            aria-label="Edit total playtime"
            className="flex h-8 items-center gap-1.5 border-2 border-black bg-[#b7102a] px-3 text-[11px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#990a20] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isSignedIn}
            type="button"
            onClick={openEditTotal}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Total
          </button>
        </div>

        <div className="space-y-2 border-t-2 border-black/10 pt-3">
          <div className="flex items-center justify-between">
            <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
              <History className="mr-1 inline h-3 w-3" />
              Sessions ({total})
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  aria-label="Previous page"
                  className="grid h-6 w-6 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page === 0 || isLoadingSessions}
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                  {page + 1}/{totalPages}
                </span>
                <button
                  aria-label="Next page"
                  className="grid h-6 w-6 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page + 1 >= totalPages || isLoadingSessions}
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>

          {isLoadingSessions ? (
            <div className="flex items-center gap-2 py-2 text-[10px] font-bold uppercase text-[#55504a]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading sessions…
            </div>
          ) : sessionsError ? (
            <p className="border-2 border-black bg-[#fbd6dc] p-2 text-[10px] font-black uppercase text-[#7a0918]">
              {sessionsError}
            </p>
          ) : catalogError && !catalogGameId ? (
            <p className="border-2 border-black bg-[#f6edd8] p-2 text-[10px] font-bold uppercase text-[#655f58]">
              {catalogError} Sessions are not editable until the catalog row exists.
            </p>
          ) : sessions.length === 0 ? (
            <p className="neo-copy py-2 text-[11px] font-bold uppercase text-[#5b403f]">
              No sessions recorded yet
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="grid gap-1.5 border-2 border-black bg-[#f6edd8] p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p
                      className="neo-copy truncate text-[10px] font-black uppercase text-[#5b403f]"
                      title={session.id}
                    >
                      #{maskGameId(session.id)}
                    </p>
                    <p className="neo-copy truncate text-[11px] font-bold text-[#171411]">
                      {formatSessionTimeRange(session)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#171411]">
                        {formatDurationLabel(session.durationMinutes)}
                      </span>
                      {session.platform ? (
                        <span className="neo-copy border border-black bg-[#087d6d] px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                          {session.platform}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:justify-end">
                    <button
                      aria-label={`Edit session ${session.id}`}
                      className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[1px_1px_0_#171411] hover:bg-[#f5eedf]"
                      type="button"
                      onClick={() => openEditSession(session)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`Delete session ${session.id}`}
                      className="grid h-7 w-7 place-items-center border-2 border-black bg-[#b7102a] text-white shadow-[1px_1px_0_#171411] hover:bg-[#990a20]"
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(session);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isEditTotalOpen ? (
        <div
          aria-label="Edit total playtime"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <form
            className="w-full max-w-[420px] border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#1f1c0f]"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveTotal();
            }}
          >
            <div className="flex items-center justify-between border-b-2 border-black bg-[#171411] px-4 py-3 text-white">
              <h3 className="neo-title text-lg uppercase leading-none">Edit Total Playtime</h3>
              <button
                aria-label="Close dialog"
                className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411]"
                type="button"
                onClick={closeEditTotal}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Minutes
                </span>
                <input
                  className="mt-1 h-11 w-full border-2 border-black bg-[#fffaf0] px-3 text-[14px] font-black shadow-[2px_2px_0_#171411] outline-none"
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={editTotalValue}
                  onChange={(event) => {
                    setEditTotalError(null);
                    setEditTotalValue(event.target.value);
                  }}
                />
              </label>
              <p className="neo-copy text-[10px] font-bold uppercase text-[#5b403f]">
                Updates both the local cache and the Supabase aggregate (
                {formatHours(Number(editTotalValue) || 0)}).
              </p>
              {editTotalError ? (
                <p className="neo-copy border-2 border-black bg-[#fbd6dc] px-3 py-2 text-[11px] font-black uppercase text-[#7a0918]">
                  {editTotalError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t-2 border-black pt-3">
                <button
                  className="border-2 border-black bg-[#fbf4e7] px-4 py-2 text-[12px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#f5eedf]"
                  type="button"
                  onClick={closeEditTotal}
                >
                  Cancel
                </button>
                <button
                  className="border-2 border-black bg-[#087d6d] px-4 py-2 text-[12px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#06685a] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSavingTotal}
                  type="submit"
                >
                  {isSavingTotal ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {editingSession ? (
        <div
          aria-label="Edit play session"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <form
            className="w-full max-w-[440px] border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#1f1c0f]"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveSession();
            }}
          >
            <div className="flex items-center justify-between border-b-2 border-black bg-[#171411] px-4 py-3 text-white">
              <h3 className="neo-title text-lg uppercase leading-none">Edit Session</h3>
              <button
                aria-label="Close dialog"
                className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411]"
                type="button"
                onClick={closeEditSession}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Started At
                </span>
                <input
                  className="mt-1 h-10 w-full border-2 border-black bg-[#fffaf0] px-3 text-[13px] font-bold shadow-[2px_2px_0_#171411] outline-none"
                  required
                  type="datetime-local"
                  value={sessionEditStartedAt}
                  onChange={(event) => {
                    setSessionEditError(null);
                    setSessionEditStartedAt(event.target.value);
                  }}
                />
              </label>
              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Ended At
                </span>
                <input
                  className="mt-1 h-10 w-full border-2 border-black bg-[#fffaf0] px-3 text-[13px] font-bold shadow-[2px_2px_0_#171411] outline-none"
                  type="datetime-local"
                  value={sessionEditEndedAt}
                  onChange={(event) => {
                    setSessionEditError(null);
                    setSessionEditEndedAt(event.target.value);
                  }}
                />
              </label>
              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Duration (minutes)
                </span>
                <input
                  className="mt-1 h-10 w-full border-2 border-black bg-[#fffaf0] px-3 text-[13px] font-bold shadow-[2px_2px_0_#171411] outline-none"
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={sessionEditDuration}
                  onChange={(event) => {
                    setSessionEditError(null);
                    setSessionEditDuration(event.target.value);
                  }}
                />
              </label>
              {sessionEditError ? (
                <p className="neo-copy border-2 border-black bg-[#fbd6dc] px-3 py-2 text-[11px] font-black uppercase text-[#7a0918]">
                  {sessionEditError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t-2 border-black pt-3">
                <button
                  className="border-2 border-black bg-[#fbf4e7] px-4 py-2 text-[12px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#f5eedf]"
                  type="button"
                  onClick={closeEditSession}
                >
                  Cancel
                </button>
                <button
                  className="border-2 border-black bg-[#087d6d] px-4 py-2 text-[12px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#06685a] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSavingSession}
                  type="submit"
                >
                  {isSavingSession ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel={isDeletingSession ? "Deleting…" : "Delete"}
        destructive
        message={deleteError ? deleteError : "This will remove the play session permanently."}
        open={pendingDelete !== null}
        title="Delete session?"
        onCancel={() => {
          if (isDeletingSession) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </section>
  );
}
