export type BroadcastProviderOAuthContractStatus = "blocked" | "review";

export interface BroadcastProviderOAuthContractInput {
  callbackErrorTaxonomyDrafted: boolean;
  hostedCallbackEndpointStaged: boolean;
  oauthAuthorizeLaunchStaged: boolean;
  pkceChallengeDrafted: boolean;
  providerAppRegistrationStaged: boolean;
  providerChatVodHandoffStaged: boolean;
  redirectAllowlistDrafted: boolean;
  redactedSecretHandlingDrafted: boolean;
  scopeReviewDrafted: boolean;
  stateNonceFixtureDrafted: boolean;
  tokenExchangeStaged: boolean;
  tokenStorageBoundaryDrafted: boolean;
}

export interface BroadcastProviderOAuthContractItem {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: BroadcastProviderOAuthContractStatus;
}

export interface BroadcastProviderOAuthContract {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  items: BroadcastProviderOAuthContractItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const BROADCAST_PROVIDER_OAUTH_CONTRACT_GUARDS = [
  "Local OAuth contract only",
  "No Twitch/YouTube OAuth",
  "No OAuth authorization redirect",
  "No OAuth token exchange",
  "No provider access token stored",
  "No provider chat read",
  "No VOD provider sync",
  "No RTMP/live output",
  "No hosted callback endpoint",
  "No audience/live-status claim",
];

const BROADCAST_PROVIDER_OAUTH_CONTRACT_GUARD_COPY =
  "Provider OAuth contract review only. The launcher renders deterministic PKCE, state, redirect, scope, callback-error, token-boundary, and secret-redaction fixtures; it does not open Twitch/YouTube authorization, exchange OAuth tokens, store provider access tokens, deploy hosted callback endpoints, read provider chat or VOD data, start RTMP/live output, or update audience/live status.";

export function buildBroadcastProviderOAuthContract(
  input: BroadcastProviderOAuthContractInput,
): BroadcastProviderOAuthContract {
  const items: BroadcastProviderOAuthContractItem[] = [
    {
      action: input.pkceChallengeDrafted
        ? "Keep verifier/challenge generation local until provider apps and callback secrets exist."
        : "Draft PKCE verifier and S256 challenge rules before any provider authorization work.",
      detail: input.pkceChallengeDrafted
        ? "PKCE fixture documents verifier length, S256 challenge derivation, and one-shot callback use without creating an auth URL."
        : "No PKCE fixture is staged for provider OAuth review.",
      evidence: input.pkceChallengeDrafted
        ? "S256 challenge // 43-128 char verifier // callback-only"
        : "missing",
      id: "pkce-challenge",
      label: "PKCE challenge fixture",
      status: input.pkceChallengeDrafted ? "review" : "blocked",
    },
    {
      action: input.stateNonceFixtureDrafted
        ? "Keep state and nonce fixtures short-lived and local until callback persistence is reviewed."
        : "Draft state nonce and replay-window fixtures before opening provider authorization.",
      detail: input.stateNonceFixtureDrafted
        ? "State fixture covers nonce, issued-at timestamp, replay window, and local route binding without provider traffic."
        : "No state nonce fixture is staged.",
      evidence: input.stateNonceFixtureDrafted
        ? "nonce // issued_at // 10m replay window // route binding"
        : "missing",
      id: "state-nonce-fixture",
      label: "State nonce fixture",
      status: input.stateNonceFixtureDrafted ? "review" : "blocked",
    },
    {
      action: input.redirectAllowlistDrafted
        ? "Keep redirect matching exact and local until hosted callback URLs are registered."
        : "Draft exact redirect URI allowlist before provider app registration.",
      detail: input.redirectAllowlistDrafted
        ? "Redirect fixture lists exact launcher and hosted callback shapes only; no redirect is opened."
        : "No redirect allowlist fixture is staged.",
      evidence: input.redirectAllowlistDrafted
        ? "oglauncher://broadcast/oauth-callback // /functions/v1/broadcast-provider-oauth-callback"
        : "missing",
      id: "redirect-allowlist",
      label: "Redirect URI allowlist",
      status: input.redirectAllowlistDrafted ? "review" : "blocked",
    },
    {
      action: input.scopeReviewDrafted
        ? "Keep requested scopes minimal and review-only until provider policy approval exists."
        : "Draft Twitch/YouTube scope review before provider authorization.",
      detail: input.scopeReviewDrafted
        ? "Scope fixture separates stream setup, chat read, moderation, and VOD archive needs without requesting scopes."
        : "No provider scope review is staged.",
      evidence: input.scopeReviewDrafted
        ? "stream setup // chat read // moderation // VOD archive review"
        : "missing",
      id: "scope-review",
      label: "Provider scope review",
      status: input.scopeReviewDrafted ? "review" : "blocked",
    },
    {
      action: input.callbackErrorTaxonomyDrafted
        ? "Keep provider callback failures mapped locally until hosted callback handling exists."
        : "Draft callback error taxonomy before token exchange work.",
      detail: input.callbackErrorTaxonomyDrafted
        ? "Error taxonomy covers denied consent, missing code, state mismatch, expired state, and unsupported provider."
        : "No OAuth callback error taxonomy is staged.",
      evidence: input.callbackErrorTaxonomyDrafted
        ? "access_denied // missing code // state mismatch // expired state"
        : "missing",
      id: "callback-error-taxonomy",
      label: "Callback error taxonomy",
      status: input.callbackErrorTaxonomyDrafted ? "review" : "blocked",
    },
    {
      action: input.tokenStorageBoundaryDrafted
        ? "Keep access/refresh token storage out of browser localStorage and behind desktop or hosted secrets."
        : "Draft token storage boundary before exchanging provider tokens.",
      detail: input.tokenStorageBoundaryDrafted
        ? "Token boundary fixture stores only provider label, redacted subject hash, expiry, and revocation state."
        : "No token storage boundary is staged.",
      evidence: input.tokenStorageBoundaryDrafted
        ? "desktop keychain or hosted secret // subject hash // expiry // revocation"
        : "missing",
      id: "token-storage-boundary",
      label: "Token storage boundary",
      status: input.tokenStorageBoundaryDrafted ? "review" : "blocked",
    },
    {
      action: input.redactedSecretHandlingDrafted
        ? "Keep client secrets, tokens, and auth codes redacted in logs, UI, screenshots, and audit rows."
        : "Draft redaction rules for OAuth secrets before any provider callback work.",
      detail: input.redactedSecretHandlingDrafted
        ? "Secret redaction fixture covers auth code, access token, refresh token, client secret, and stream key names only."
        : "No OAuth secret redaction rules are staged.",
      evidence: input.redactedSecretHandlingDrafted
        ? "auth code redacted // token redacted // client secret redacted // stream key redacted"
        : "missing",
      id: "redacted-secret-handling",
      label: "Redacted secret handling",
      status: input.redactedSecretHandlingDrafted ? "review" : "blocked",
    },
    {
      action: input.providerAppRegistrationStaged
        ? "Keep provider app registration behind review until callback ownership and scopes are approved."
        : "Block provider app registration until PKCE, redirects, scopes, and secret boundaries pass review.",
      detail: input.providerAppRegistrationStaged
        ? "Provider app registration evidence exists, but sign-in remains disabled."
        : "No Twitch/YouTube provider app registration is staged.",
      evidence: input.providerAppRegistrationStaged ? "registration checklist only" : "blocked",
      id: "provider-app-registration",
      label: "Provider app registration",
      status: input.providerAppRegistrationStaged ? "review" : "blocked",
    },
    {
      action: input.hostedCallbackEndpointStaged
        ? "Keep hosted callback endpoint work behind review until secrets and replay protection pass."
        : "Block hosted callback endpoint deployment until redirect, state, and token-boundary contracts are staged.",
      detail: input.hostedCallbackEndpointStaged
        ? "Hosted callback endpoint evidence exists, but callback execution remains disabled."
        : "No hosted OAuth callback endpoint is staged.",
      evidence: input.hostedCallbackEndpointStaged ? "endpoint checklist only" : "blocked",
      id: "hosted-callback-endpoint",
      label: "Hosted callback endpoint",
      status: input.hostedCallbackEndpointStaged ? "review" : "blocked",
    },
    {
      action: input.oauthAuthorizeLaunchStaged
        ? "Keep authorization launch behind review until provider app registration and callback endpoint are approved."
        : "Block provider authorization redirects until app registration and callback contracts are staged.",
      detail: input.oauthAuthorizeLaunchStaged
        ? "Authorization launch evidence exists, but no browser redirect is opened."
        : "No provider authorization redirect is staged.",
      evidence: input.oauthAuthorizeLaunchStaged ? "launch checklist only" : "blocked",
      id: "oauth-authorize-launch",
      label: "OAuth authorize launch",
      status: input.oauthAuthorizeLaunchStaged ? "review" : "blocked",
    },
    {
      action: input.tokenExchangeStaged
        ? "Keep token exchange behind review until provider secrets and revocation handling are verified."
        : "Block token exchange until hosted callback secrets, storage, and revocation are staged.",
      detail: input.tokenExchangeStaged
        ? "Token exchange evidence exists, but no OAuth token request is sent."
        : "No provider OAuth token exchange is staged.",
      evidence: input.tokenExchangeStaged ? "token exchange checklist only" : "blocked",
      id: "token-exchange",
      label: "Token exchange",
      status: input.tokenExchangeStaged ? "review" : "blocked",
    },
    {
      action: input.providerChatVodHandoffStaged
        ? "Keep provider chat and VOD handoffs behind review until OAuth scopes and retention are approved."
        : "Block provider chat/VOD handoff until OAuth, retention, and delete coverage are staged.",
      detail: input.providerChatVodHandoffStaged
        ? "Provider chat/VOD handoff evidence exists, but provider reads and sync remain disabled."
        : "No provider chat read or VOD provider sync handoff is staged.",
      evidence: input.providerChatVodHandoffStaged ? "handoff checklist only" : "blocked",
      id: "provider-chat-vod-handoff",
      label: "Provider chat/VOD handoff",
      status: input.providerChatVodHandoffStaged ? "review" : "blocked",
    },
  ];

  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: BROADCAST_PROVIDER_OAUTH_CONTRACT_GUARD_COPY,
    guards: [...BROADCAST_PROVIDER_OAUTH_CONTRACT_GUARDS],
    items,
    reviewCount,
    statusLabel: "Local OAuth contract",
    summary:
      "Local provider OAuth contract review covers PKCE, state, redirect URI allowlists, provider scopes, callback errors, token storage boundaries, and secret redaction while provider app registration, hosted callbacks, authorization redirects, token exchange, chat/VOD handoffs, RTMP/live output, and audience status stay blocked.",
  };
}

export function createVerifyBroadcastProviderOAuthContract(): BroadcastProviderOAuthContract {
  return buildBroadcastProviderOAuthContract({
    callbackErrorTaxonomyDrafted: true,
    hostedCallbackEndpointStaged: false,
    oauthAuthorizeLaunchStaged: false,
    pkceChallengeDrafted: true,
    providerAppRegistrationStaged: false,
    providerChatVodHandoffStaged: false,
    redirectAllowlistDrafted: true,
    redactedSecretHandlingDrafted: true,
    scopeReviewDrafted: true,
    stateNonceFixtureDrafted: true,
    tokenExchangeStaged: false,
    tokenStorageBoundaryDrafted: true,
  });
}
