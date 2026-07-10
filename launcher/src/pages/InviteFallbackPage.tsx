import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Gamepad2,
  Link as LinkIcon,
  Loader2,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useCurrentUser } from "../hooks/useCurrentUser";
import { buildInviteDeepLink } from "../lib/invite-links";
import {
  getInviteHostedReplayProofReadiness,
  getInviteHostedStagingRehearsal,
  getInviteHostedReadiness,
  type InviteHostedReplayProofReadiness,
  type InviteHostedReplayProofState,
  type InviteHostedReadiness,
  type InviteHostedReadinessRow,
  type InviteHostedReadinessStatus,
  type InviteHostedStagingRehearsal,
  type InviteHostedStagingStep,
} from "../lib/invite-readiness";
import {
  proveInviteHostedReplay,
  redeemShareToken,
  resolveShareToken,
  type InviteHostedReplayProof,
  type RedeemedShareToken,
  type ResolvedShareToken,
} from "../lib/supabase/social";

export function InviteFallbackPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [resolvedToken, setResolvedToken] = useState<ResolvedShareToken | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "resolved" | "missing">(
    "idle",
  );
  const [redeemState, setRedeemState] = useState<"idle" | "loading" | "accepted" | "error">("idle");
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [redeemedToken, setRedeemedToken] = useState<RedeemedShareToken | null>(null);
  const [hostedProofState, setHostedProofState] = useState<InviteHostedReplayProofState>("idle");
  const [hostedProofMessage, setHostedProofMessage] = useState<string | null>(null);
  const [hostedReplayProof, setHostedReplayProof] = useState<InviteHostedReplayProof | null>(null);
  const queryGame = searchParams.get("game");
  const queryPlatform = searchParams.get("platform");
  const game = queryGame?.trim() || redeemedToken?.gameTitle || resolvedToken?.gameTitle || null;
  const platform =
    queryPlatform?.trim() || redeemedToken?.platform || resolvedToken?.platform || null;
  const inviteLink = useMemo(
    () => buildInviteDeepLink({ gameTitle: game, platform, token }),
    [game, platform, token],
  );
  const hostedFallbackOrigin = import.meta.env.VITE_INVITE_FALLBACK_ORIGIN?.trim() ?? "";
  const fixtureHostedReplayProof = useMemo(
    () =>
      searchParams.get("verify") === "invite-hosted-replay-origin-proof"
        ? createInviteHostedReplayProofFixture({
            game,
            hostedFallbackOrigin,
            platform,
            token,
          })
        : null,
    [game, hostedFallbackOrigin, platform, searchParams, token],
  );
  const visibleHostedReplayProof = hostedReplayProof ?? fixtureHostedReplayProof;
  const visibleHostedProofState: InviteHostedReplayProofState = visibleHostedReplayProof
    ? "verified"
    : hostedProofState;
  const effectiveHostedOrigin = visibleHostedReplayProof?.origin ?? hostedFallbackOrigin;
  const hostedProofVerified = Boolean(
    visibleHostedReplayProof?.originVerified && visibleHostedReplayProof.replayDenied,
  );
  const inviteReadiness = useMemo(
    () =>
      getInviteHostedReadiness({
        hasConfiguredHostedOrigin: effectiveHostedOrigin.startsWith("https://"),
        hostedVerified: hostedProofVerified,
        isSignedIn: Boolean(user),
        isSupabaseConfigured: isConfigured,
        lookupState,
        token,
      }),
    [effectiveHostedOrigin, hostedProofVerified, isConfigured, lookupState, token, user],
  );
  const inviteStagingRehearsal = useMemo(
    () =>
      getInviteHostedStagingRehearsal({
        isSignedIn: Boolean(user),
        isSupabaseConfigured: isConfigured,
        lookupState,
        redeemState,
        token,
      }),
    [isConfigured, lookupState, redeemState, token, user],
  );
  const inviteHostedReplayProofReadiness = useMemo(
    () =>
      getInviteHostedReplayProofReadiness({
        configuredHostedOrigin: effectiveHostedOrigin,
        isSignedIn: Boolean(user),
        isSupabaseConfigured: isConfigured,
        proof: visibleHostedReplayProof,
        proofState: visibleHostedProofState,
        redeemState,
        token,
      }),
    [
      effectiveHostedOrigin,
      isConfigured,
      redeemState,
      token,
      user,
      visibleHostedProofState,
      visibleHostedReplayProof,
    ],
  );
  const displayGame = game?.trim() || "Any linked game";
  const displayPlatform = platform?.trim() || "Launcher default";

  useEffect(() => {
    setRedeemState("idle");
    setRedeemMessage(null);
    setRedeemedToken(null);
    setHostedProofState("idle");
    setHostedProofMessage(null);
    setHostedReplayProof(null);

    if (!isConfigured || !token.trim()) {
      setResolvedToken(null);
      setLookupState("idle");
      return;
    }

    let isActive = true;
    setLookupState("loading");
    void resolveShareToken(token)
      .then((result) => {
        if (!isActive) return;
        setResolvedToken(result);
        setLookupState(result ? "resolved" : "missing");
      })
      .catch(() => {
        if (!isActive) return;
        setResolvedToken(null);
        setLookupState("missing");
      });

    return () => {
      isActive = false;
    };
  }, [isConfigured, token]);

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function acceptInvite() {
    if (!user || lookupState !== "resolved" || !token.trim()) return;

    setRedeemState("loading");
    setRedeemMessage(null);

    try {
      const result = await redeemShareToken(token);
      if (!result) {
        setRedeemState("error");
        setRedeemMessage("Invite token could not be accepted.");
        return;
      }

      setRedeemedToken(result);
      setRedeemState("accepted");
      setRedeemMessage("Invite accepted. This link is now claimed by your account.");

      setHostedProofState("loading");
      try {
        const proof = await proveInviteHostedReplay(token);
        if (proof?.originVerified && proof.replayDenied) {
          setHostedReplayProof(proof);
          setHostedProofState("verified");
          setHostedProofMessage(
            "Hosted staging proof captured: allowed Origin plus rejected second redeem.",
          );
          return;
        }

        setHostedProofState("unavailable");
        setHostedProofMessage("Invite accepted; hosted replay/origin proof is not available yet.");
      } catch (error) {
        setHostedProofState("unavailable");
        setHostedProofMessage(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      setRedeemState("error");
      setRedeemMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[11px] font-black tracking-[0.14em] text-white uppercase shadow-[3px_3px_0_#171411]">
            Web Invite Fallback
          </p>
          <h1 className="neo-title mt-3 max-w-[760px] text-[3.4rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.3rem] xl:text-[6rem]">
            Join Session
          </h1>
        </div>
        <div className="neo-dots border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
          <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#5b403f] uppercase">
            Invite Token
          </p>
          <p className="neo-title mt-1 max-w-[260px] truncate text-2xl leading-none text-[#171411]">
            {token}
          </p>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="flex items-center gap-2 border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
            <Gamepad2 className="h-5 w-5 text-[#8cf5e4]" />
            <h2 className="neo-title text-3xl leading-none">Open OG Launcher</h2>
          </div>
          <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <p className="neo-copy max-w-2xl text-sm leading-6 font-bold text-[#5b403f]">
                This share link resolves on the server. Sign in to claim it; the first successful
                acceptance consumes the one-use token.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InviteFact label="Game" value={displayGame} />
                <InviteFact label="Platform" value={displayPlatform} />
              </div>
              {lookupState !== "idle" ? (
                <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-3 py-2 text-[9px] font-black tracking-[0.08em] text-[#5b403f] uppercase">
                  Token Lookup //{" "}
                  {lookupState === "loading"
                    ? "checking"
                    : lookupState === "resolved"
                      ? "server verified"
                      : "fallback context only"}
                </p>
              ) : null}
              <div className="mt-5 border-[3px] border-black bg-[#efe6d4] p-3 shadow-[3px_3px_0_#171411]">
                <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#5b403f] uppercase">
                  Deep Link
                </p>
                <code className="mt-2 block border-2 border-black bg-[#fff9ed] px-3 py-2 text-[12px] font-black break-all text-[#171411]">
                  {inviteLink}
                </code>
              </div>
            </div>

            <div className="card-art-drift relative min-h-[220px] overflow-hidden border-[3px] border-black shadow-[4px_4px_0_#171411]">
              <div className="absolute top-3 left-3 border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase">
                Join Relay
              </div>
              <div className="absolute right-3 bottom-3 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
                App Link
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          {isConfigured ? (
            isAuthLoading ? (
              <p className="neo-copy border-2 border-black bg-[#efe6d4] px-3 py-2 text-xs font-black tracking-[0.08em] text-[#5b403f] uppercase shadow-[2px_2px_0_#171411]">
                Checking login state.
              </p>
            ) : user ? (
              <button
                className="neo-copy flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#007166] px-4 py-3 text-sm font-black tracking-[0.1em] text-white uppercase shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                disabled={lookupState !== "resolved" || redeemState === "loading"}
                type="button"
                onClick={() => void acceptInvite()}
              >
                {redeemState === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {redeemState === "loading" ? "Accepting..." : "Accept Invite"}
              </button>
            ) : (
              <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]">
                <p className="neo-copy text-[10px] font-black tracking-[0.1em] text-[#5b403f] uppercase">
                  Login required to claim this share link
                </p>
                <Link
                  className="neo-copy mt-3 flex h-10 items-center justify-center border-2 border-black bg-[#007166] text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[2px_2px_0_#171411]"
                  to="/auth"
                >
                  Login
                </Link>
              </div>
            )
          ) : (
            <p className="neo-copy border-2 border-black bg-[#efe6d4] px-3 py-2 text-xs font-black tracking-[0.08em] text-[#5b403f] uppercase shadow-[2px_2px_0_#171411]">
              Supabase required to accept invites.
            </p>
          )}
          {redeemMessage ? (
            <p
              className={`neo-copy border-2 border-black px-3 py-2 text-xs font-black tracking-[0.08em] uppercase shadow-[2px_2px_0_#171411] ${
                redeemState === "accepted"
                  ? "bg-[#8cf5e4] text-[#171411]"
                  : "bg-[#b7102a] text-white"
              }`}
            >
              {redeemMessage}
            </p>
          ) : null}
          <a
            className="neo-copy flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 py-3 text-sm font-black tracking-[0.1em] text-white uppercase shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411]"
            href={inviteLink}
          >
            <ExternalLink className="h-4 w-4" />
            Open Launcher
          </a>
          <button
            className="neo-copy flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#007166] px-4 py-3 text-sm font-black tracking-[0.1em] text-white uppercase shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#171411]"
            type="button"
            onClick={copyInviteLink}
          >
            {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copyState === "copied" ? "Copied" : "Copy Link"}
          </button>
          {copyState === "failed" ? (
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-xs font-bold tracking-[0.08em] text-[#b7102a] uppercase shadow-[2px_2px_0_#171411]">
              Clipboard unavailable. Select the deep link manually.
            </p>
          ) : null}
          <Link
            className="neo-copy flex items-center justify-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 py-3 text-sm font-black tracking-[0.1em] text-[#171411] uppercase shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f6edd8] hover:shadow-[6px_6px_0_#171411]"
            to="/friends?tab=invites"
          >
            <LinkIcon className="h-4 w-4" />
            Invite Panel
          </Link>
          <InviteHostedReadinessPanel readiness={inviteReadiness} />
          <InviteHostedStagingRehearsalPanel rehearsal={inviteStagingRehearsal} />
          <InviteHostedReplayProofPanel
            message={hostedProofMessage}
            readiness={inviteHostedReplayProofReadiness}
          />
        </aside>
      </section>
    </div>
  );
}

function InviteHostedReplayProofPanel({
  message,
  readiness,
}: {
  message: string | null;
  readiness: InviteHostedReplayProofReadiness;
}) {
  return (
    <section
      aria-label="Invite hosted replay origin proof"
      className="neo-dots border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-2 py-1 text-[8px] font-black tracking-[0.12em] text-white uppercase">
            Hosted Proof Packet
          </p>
          <h2 className="neo-title mt-2 text-3xl leading-none text-[#171411]">Replay Origin</h2>
        </div>
        <span
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[8px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] ${readinessToneClass(
            readiness.tone,
          )}`}
        >
          {readiness.statusLabel}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] px-3 py-2 text-[9px] leading-5 font-black text-[#5b403f] uppercase">
        {readiness.summary}
      </p>
      {message ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-3 py-2 text-[9px] leading-5 font-black text-[#fff9ed] uppercase">
          {message}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-[1fr_42px] items-center gap-2">
        <div className="h-3 border-2 border-black bg-[#efe6d4]">
          <div
            className={`h-full ${readinessProgressClass(readiness.tone)}`}
            style={{ width: `${readiness.progress}%` }}
          />
        </div>
        <span className="neo-copy text-right text-[9px] font-black text-[#171411] uppercase">
          {readiness.progress}%
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {readiness.rows.map((row) => (
          <InviteReadinessRowCard key={row.id} row={row} />
        ))}
      </div>
      <div className="mt-3 grid gap-2 border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
        <InviteProofFact label="Origin" value={readiness.origin ?? "Proof pending"} />
        <InviteProofFact label="Token Hint" value={readiness.tokenHint ?? "No proof packet"} />
        <InviteProofFact label="Checked At" value={readiness.checkedAt ?? "Not checked"} />
      </div>
      <div className="mt-3 grid gap-2">
        {readiness.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black text-[#8cf5e4] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </section>
  );
}

function InviteHostedStagingRehearsalPanel({
  rehearsal,
}: {
  rehearsal: InviteHostedStagingRehearsal;
}) {
  return (
    <section
      aria-label="Invite hosted token staging rehearsal"
      className="border-[3px] border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[4px_4px_0_#b7102a]"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-[#fff9ed] pb-2">
        <div>
          <p className="neo-copy inline-flex border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] font-black tracking-[0.12em] text-[#8cf5e4] uppercase">
            Hosted E2E Packet
          </p>
          <h2 className="neo-title mt-2 text-3xl leading-none">Token Rehearsal</h2>
        </div>
        <span
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[8px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#fff9ed] ${readinessToneClass(
            rehearsal.tone,
          )}`}
        >
          {rehearsal.statusLabel}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black text-[#fff9ed] uppercase">
        {rehearsal.summary}
      </p>
      <div className="mt-3 grid grid-cols-[1fr_42px] items-center gap-2">
        <div className="h-3 border-2 border-[#fff9ed] bg-[#2a221b]">
          <div
            className={`h-full ${readinessProgressClass(rehearsal.tone)}`}
            style={{ width: `${rehearsal.progress}%` }}
          />
        </div>
        <span className="neo-copy text-right text-[9px] font-black text-[#fff9ed] uppercase">
          {rehearsal.progress}%
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {rehearsal.steps.map((step) => (
          <InviteReadinessRowCard key={step.id} row={step} />
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {rehearsal.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] leading-4 font-black text-[#8cf5e4] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </section>
  );
}

function InviteHostedReadinessPanel({ readiness }: { readiness: InviteHostedReadiness }) {
  return (
    <section
      aria-label="Invite hosted readiness"
      className="neo-dots border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black tracking-[0.12em] text-[#fff9ed] uppercase">
            Share Link Relay
          </p>
          <h2 className="neo-title mt-2 text-3xl leading-none text-[#171411]">Invite Readiness</h2>
        </div>
        <span
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[8px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] ${readinessToneClass(
            readiness.tone,
          )}`}
        >
          {readiness.statusLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_42px] items-center gap-2">
        <div className="h-3 border-2 border-black bg-[#efe6d4]">
          <div
            className={`h-full ${readinessProgressClass(readiness.tone)}`}
            style={{ width: `${readiness.progress}%` }}
          />
        </div>
        <span className="neo-copy text-right text-[9px] font-black text-[#171411] uppercase">
          {readiness.progress}%
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {readiness.rows.map((row) => (
          <InviteReadinessRowCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function InviteReadinessRowCard({
  row,
}: {
  row: Pick<InviteHostedReadinessRow | InviteHostedStagingStep, "detail" | "label" | "status">;
}) {
  const Icon = readinessIcon(row.status);
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411]">
      <div className="flex items-center justify-between gap-2">
        <p className="neo-copy flex min-w-0 items-center gap-2 text-[9px] font-black tracking-[0.1em] text-[#171411] uppercase">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{row.label}</span>
        </p>
        <span
          className={`neo-copy border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${readinessToneClass(
            row.status,
          )}`}
        >
          {row.status}
        </span>
      </div>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-bold tracking-[0.04em] text-[#5b403f] uppercase">
        {row.detail}
      </p>
    </div>
  );
}

function InviteFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="neo-dots border-[3px] border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#5b403f] uppercase">
        {label}
      </p>
      <p className="neo-title mt-1 truncate text-2xl leading-none text-[#171411]">{value}</p>
    </div>
  );
}

function InviteProofFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="neo-copy text-[8px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
        {label}
      </p>
      <p className="neo-copy text-[10px] leading-4 font-black break-all text-[#171411] uppercase">
        {value}
      </p>
    </div>
  );
}

function createInviteHostedReplayProofFixture(input: {
  game: string | null;
  hostedFallbackOrigin: string;
  platform: string | null;
  token: string;
}): InviteHostedReplayProof {
  const origin = input.hostedFallbackOrigin.startsWith("https://")
    ? input.hostedFallbackOrigin
    : "https://invite.og-launcher.test";

  return {
    checkedAt: "2026-06-13T09:30:00.000Z",
    deploymentScope: "hosted-staging",
    gameInviteId: "invite-hosted-proof-fixture",
    gameTitle: input.game?.trim() || "Neon Circuit",
    guards: [
      "Allowed HTTPS Origin only",
      "Authenticated receiver or sender",
      "No raw token echoed",
      "No token hash returned",
      "Second redeem rejected",
      "No production deployment claim",
    ],
    inviteStatus: "accepted",
    maxUses: 1,
    origin,
    originVerified: true,
    platform: (input.platform?.trim() || "steam") as InviteHostedReplayProof["platform"],
    replayDenied: true,
    replayError: "Invite token is not redeemable.",
    tokenHint: buildTokenHint(input.token),
    usedAt: "2026-06-13T09:29:20.000Z",
    usesCount: 1,
  };
}

function buildTokenHint(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return "missing";
  if (trimmed.length <= 18) return `${trimmed.slice(0, 6)}...`;
  return `${trimmed.slice(0, 10)}...${trimmed.slice(-6)}`;
}

function readinessIcon(status: InviteHostedReadinessStatus): LucideIcon {
  if (status === "ready") return ShieldCheck;
  if (status === "warning") return AlertTriangle;
  return XCircle;
}

function readinessToneClass(status: InviteHostedReadinessStatus) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "warning") return "bg-[#f6edd8] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function readinessProgressClass(status: InviteHostedReadinessStatus) {
  if (status === "ready") return "bg-[#087d6d]";
  if (status === "warning") return "bg-[#f56c2d]";
  return "bg-[#b7102a]";
}
