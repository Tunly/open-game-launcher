export type RemoteCompanionCloudContractTone = "ready" | "warning" | "blocked";

export type RemoteCompanionCloudContractRowId =
  | "desktop-vault"
  | "hosted-deploy"
  | "opaque-jobs"
  | "pairing-rpc"
  | "relay-function"
  | "schema-rls"
  | "store-ticket-jobs";

export interface RemoteCompanionCloudContractInput {
  hasDesktopSecretVault: boolean;
  hasHostedDeployment: boolean;
  hasOpaqueJobQueue: boolean;
  hasPairingRpc: boolean;
  hasRelayFunction: boolean;
  hasSchemaRls: boolean;
  hasStoreBuildTicketContract: boolean;
}

export interface RemoteCompanionCloudContractRow {
  detail: string;
  id: RemoteCompanionCloudContractRowId;
  label: string;
  status: RemoteCompanionCloudContractTone;
}

export interface RemoteCompanionCloudContractReadiness {
  blocker: RemoteCompanionCloudContractRow | null;
  progress: number;
  rows: RemoteCompanionCloudContractRow[];
  tone: RemoteCompanionCloudContractTone;
}

export function getRemoteCompanionCloudReadiness(
  input: RemoteCompanionCloudContractInput,
): RemoteCompanionCloudContractReadiness {
  const rows: RemoteCompanionCloudContractRow[] = [
    schemaRlsRow(input.hasSchemaRls),
    pairingRpcRow(input.hasPairingRpc),
    opaqueJobQueueRow(input.hasOpaqueJobQueue),
    storeBuildTicketRow(input.hasStoreBuildTicketContract),
    relayFunctionRow(input.hasRelayFunction),
    desktopVaultRow(input.hasDesktopSecretVault),
    hostedDeployRow(input.hasHostedDeployment),
  ];
  const blocker = rows.find((row) => row.status === "blocked") ?? null;
  const warning = rows.some((row) => row.status === "warning");
  const passedCount = rows.filter((row) => row.status === "ready").length;

  return {
    blocker,
    progress: Math.round((passedCount / rows.length) * 100),
    rows,
    tone: blocker ? "blocked" : warning ? "warning" : "ready",
  };
}

function schemaRlsRow(hasSchemaRls: boolean): RemoteCompanionCloudContractRow {
  if (!hasSchemaRls) {
    return {
      detail: "Companion device and job tables are not staged yet.",
      id: "schema-rls",
      label: "Schema + RLS",
      status: "blocked",
    };
  }

  return {
    detail: "Owner-scoped companion devices and jobs are covered by RLS.",
    id: "schema-rls",
    label: "Schema + RLS",
    status: "ready",
  };
}

function pairingRpcRow(hasPairingRpc: boolean): RemoteCompanionCloudContractRow {
  if (!hasPairingRpc) {
    return {
      detail: "Hosted pairing RPCs are missing.",
      id: "pairing-rpc",
      label: "Pairing RPC",
      status: "blocked",
    };
  }

  return {
    detail: "Pairing codes and desktop device secrets are returned once and stored as hashes.",
    id: "pairing-rpc",
    label: "Pairing RPC",
    status: "ready",
  };
}

function opaqueJobQueueRow(hasOpaqueJobQueue: boolean): RemoteCompanionCloudContractRow {
  if (!hasOpaqueJobQueue) {
    return {
      detail: "Remote install jobs still need an opaque queue contract.",
      id: "opaque-jobs",
      label: "Opaque Jobs",
      status: "blocked",
    };
  }

  return {
    detail: "Jobs store product/build references and sanitized metadata, not package locations.",
    id: "opaque-jobs",
    label: "Opaque Jobs",
    status: "ready",
  };
}

function storeBuildTicketRow(
  hasStoreBuildTicketContract: boolean,
): RemoteCompanionCloudContractRow {
  if (!hasStoreBuildTicketContract) {
    return {
      detail: "Store product/build jobs can still accept generic package references.",
      id: "store-ticket-jobs",
      label: "Store Ticket Jobs",
      status: "blocked",
    };
  }

  return {
    detail:
      "Store product/build jobs require store-build-ticket refs with download tickets, not raw package metadata.",
    id: "store-ticket-jobs",
    label: "Store Ticket Jobs",
    status: "ready",
  };
}

function relayFunctionRow(hasRelayFunction: boolean): RemoteCompanionCloudContractRow {
  if (!hasRelayFunction) {
    return {
      detail: "remote-companion-relay function is not staged yet.",
      id: "relay-function",
      label: "Relay Function",
      status: "blocked",
    };
  }

  return {
    detail: "Caller-authenticated relay maps web/mobile actions to the companion RPCs.",
    id: "relay-function",
    label: "Relay Function",
    status: "ready",
  };
}

function desktopVaultRow(hasDesktopSecretVault: boolean): RemoteCompanionCloudContractRow {
  if (!hasDesktopSecretVault) {
    return {
      detail: "Desktop app still needs a keychain-backed device-secret vault.",
      id: "desktop-vault",
      label: "Desktop Vault",
      status: "blocked",
    };
  }

  return {
    detail: "One-time device secrets are routed into the desktop keychain and redacted from UI.",
    id: "desktop-vault",
    label: "Desktop Vault",
    status: "ready",
  };
}

function hostedDeployRow(hasHostedDeployment: boolean): RemoteCompanionCloudContractRow {
  if (!hasHostedDeployment) {
    return {
      detail: "app.og-launcher.com relay deployment and production secrets are not verified.",
      id: "hosted-deploy",
      label: "Hosted Deploy",
      status: "blocked",
    };
  }

  return {
    detail: "Hosted web relay is deployed and can enqueue companion jobs.",
    id: "hosted-deploy",
    label: "Hosted Deploy",
    status: "ready",
  };
}
