export type OneClickSetupE2EStatus = "blocked" | "ready" | "warning";

export interface OneClickSetupE2EReadinessInput {
  consentPolicyReady: boolean;
  hostedAuthReady: boolean;
  localSetupTapeReady: boolean;
  providerOAuthReady: boolean;
  rollbackAuditReady: boolean;
  silentInstallReady: boolean;
  tokenReplayReady: boolean;
}

export interface OneClickSetupE2EGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: OneClickSetupE2EStatus;
}

export interface OneClickSetupE2EReadiness {
  blockedCount: number;
  gates: OneClickSetupE2EGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const ONE_CLICK_SETUP_E2E_GUARDS = [
  "No hosted auth E2E",
  "No OAuth/token replay",
  "No provider-approved silent install",
  "No consent/terms approval",
  "No rollback/audit claim",
];

const ONE_CLICK_SETUP_E2E_GUARD_COPY =
  "Local One-Click Setup E2E readiness only. Reviews hosted/provider automation gates from launcher state; it does not verify hosted auth, replay provider OAuth or tokens, run provider-approved silent installs, record consent/terms approval, install clients automatically, or prove rollback/audit completion.";

export function buildOneClickSetupE2EReadiness(
  input: OneClickSetupE2EReadinessInput,
): OneClickSetupE2EReadiness {
  const gates: OneClickSetupE2EGate[] = [
    {
      action: input.localSetupTapeReady
        ? "Keep the local setup tape as the prerequisite for hosted E2E."
        : "Restore the local One-Click Setup tape before hosted automation.",
      detail: input.localSetupTapeReady
        ? "The launcher can stage desktop runtime, install target, store links, library seed, backup, and cloud-account gates locally."
        : "Local setup-tape evidence is missing, so hosted E2E cannot be staged.",
      id: "local-setup-tape",
      label: "Local Setup Tape",
      status: input.localSetupTapeReady ? "ready" : "blocked",
    },
    {
      action: input.hostedAuthReady
        ? "Run hosted auth in review-only mode before account bootstrap writes."
        : "Deploy and verify hosted auth/session setup against a staging project.",
      detail: input.hostedAuthReady
        ? "Hosted auth evidence exists, but setup replay remains disabled here."
        : "No hosted auth E2E run or staging session bootstrap is verified.",
      id: "hosted-auth",
      label: "Hosted Auth",
      status: input.hostedAuthReady ? "warning" : "blocked",
    },
    {
      action: input.providerOAuthReady
        ? "Keep provider OAuth replay behind consent and provider review."
        : "Stage provider-approved OAuth flows with scoped consent and redacted logs.",
      detail: input.providerOAuthReady
        ? "Provider OAuth evidence exists, but automatic replay remains disabled."
        : "No provider-approved OAuth replay path is staged for Steam, GOG, Epic, EA, Xbox, or Battle.net.",
      id: "provider-oauth",
      label: "Provider OAuth",
      status: input.providerOAuthReady ? "warning" : "blocked",
    },
    {
      action: input.tokenReplayReady
        ? "Dry-run token restore without moving secrets across devices."
        : "Define secure token replay, keychain migration, revocation, and expiry handling.",
      detail: input.tokenReplayReady
        ? "Token replay evidence exists, but cross-device secret movement remains disabled."
        : "No provider token replay, keychain migration, or revocation contract is staged.",
      id: "token-replay",
      label: "Token Replay",
      status: input.tokenReplayReady ? "warning" : "blocked",
    },
    {
      action: input.silentInstallReady
        ? "Run install automation only after provider approval and rollback review."
        : "Keep silent install blocked until every provider approves an automation path.",
      detail: input.silentInstallReady
        ? "Silent-install evidence exists, but provider client installation remains disabled."
        : "No provider-approved silent install or auto-apply path is staged.",
      id: "silent-install",
      label: "Silent Install",
      status: input.silentInstallReady ? "warning" : "blocked",
    },
    {
      action: input.consentPolicyReady
        ? "Keep consent copy visible before hosted/provider dry-runs."
        : "Document consent, provider terms, rate limits, and data retention before E2E.",
      detail: input.consentPolicyReady
        ? "Consent and terms policy evidence exists, but hosted automation remains blocked."
        : "Hosted setup still needs consent, terms, rate-limit, and retention policy.",
      id: "consent-policy",
      label: "Consent + Terms",
      status: input.consentPolicyReady ? "warning" : "blocked",
    },
    {
      action: input.rollbackAuditReady
        ? "Exercise rollback in staging before setup success can be claimed."
        : "Stage rollback, audit trail, and partial-setup cleanup before provider E2E.",
      detail: input.rollbackAuditReady
        ? "Rollback evidence exists, but setup completion remains review-only."
        : "No hosted rollback, audit trail, or partial-install cleanup run is staged.",
      id: "rollback-audit",
      label: "Rollback Audit",
      status: input.rollbackAuditReady ? "warning" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    gates,
    guardCopy: ONE_CLICK_SETUP_E2E_GUARD_COPY,
    guards: [...ONE_CLICK_SETUP_E2E_GUARDS],
    nextAction: nextGate?.action ?? "One-Click Setup E2E is ready for controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "One-Click Setup hosted/provider E2E is still local readiness evidence; auth, OAuth, token replay, install, and rollback remain open."
        : warningCount > 0
          ? "One-Click Setup has staging evidence, but provider automation still needs review."
          : "One-Click Setup hosted/provider E2E gates can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyOneClickSetupE2EReadiness(): OneClickSetupE2EReadiness {
  return buildOneClickSetupE2EReadiness({
    consentPolicyReady: true,
    hostedAuthReady: false,
    localSetupTapeReady: true,
    providerOAuthReady: false,
    rollbackAuditReady: false,
    silentInstallReady: false,
    tokenReplayReady: false,
  });
}
