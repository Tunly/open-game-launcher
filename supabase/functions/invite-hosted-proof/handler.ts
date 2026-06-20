import {
  buildInviteHostedProofCorsHeaders,
  buildInviteHostedProofPacket,
  type InviteHostedProofRow,
  parseInviteHostedProofRequest,
  verifyInviteHostedProofOrigin,
} from "./contract.ts";

export type InviteHostedProofRpcError = {
  message: string;
};

export interface InviteHostedProofCallerClient {
  getUser: () => Promise<{ data: unknown; error: unknown }>;
  proveShareTokenReplayDenial: (
    args: { token_input: string },
  ) => Promise<{
    data: InviteHostedProofRow | null;
    error: InviteHostedProofRpcError | null;
  }>;
  redeemShareToken: (args: { token_input: string }) => Promise<{
    error: InviteHostedProofRpcError | null;
  }>;
}

export interface InviteHostedProofHandlerDeps {
  allowedOrigins: string[];
  createCallerClient: (request: Request) => InviteHostedProofCallerClient;
  now?: () => Date;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...headers, "Content-Type": "application/json" },
    status,
  });
}

export async function handleInviteHostedProof(
  request: Request,
  deps: InviteHostedProofHandlerDeps,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const corsHeaders = buildInviteHostedProofCorsHeaders(
    origin,
    deps.allowedOrigins,
  );
  const originCheck = verifyInviteHostedProofOrigin({
    allowedOrigins: deps.allowedOrigins,
    origin,
  });

  if (request.method === "OPTIONS") {
    if (originCheck.status === "error") {
      return jsonResponse(
        { error: originCheck.error },
        originCheck.statusCode,
        corsHeaders,
      );
    }

    return new Response("ok", { headers: corsHeaders });
  }

  if (originCheck.status === "error") {
    return jsonResponse(
      { error: originCheck.error },
      originCheck.statusCode,
      corsHeaders,
    );
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders);
  }

  const client = deps.createCallerClient(request);
  const { data: authData, error: authError } = await client.getUser();
  if (authError || !hasAuthenticatedUser(authData)) {
    return jsonResponse(
      { error: "Invalid or expired token." },
      401,
      corsHeaders,
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseInviteHostedProofRequest(body);
  if (parsed.status === "error") {
    return jsonResponse(
      { error: parsed.error },
      parsed.statusCode,
      corsHeaders,
    );
  }

  const { data: proof, error: proofError } = await client
    .proveShareTokenReplayDenial(parsed.args);

  if (proofError || !proof) {
    return jsonResponse(
      { error: proofError?.message ?? "Invite hosted proof is not available." },
      400,
      corsHeaders,
    );
  }

  if (!proof.replay_denied) {
    return jsonResponse(
      { error: "Invite token is not consumed, replay proof is not available." },
      409,
      corsHeaders,
    );
  }

  const { error: replayError } = await client.redeemShareToken(parsed.args);

  if (!replayError) {
    return jsonResponse(
      { error: "Replay redeem was unexpectedly accepted." },
      409,
      corsHeaders,
    );
  }

  return jsonResponse(
    buildInviteHostedProofPacket({
      checkedAt: (deps.now?.() ?? new Date()).toISOString(),
      origin: originCheck.origin,
      proof,
      replayError: replayError.message,
      tokenHint: parsed.tokenHint,
    }) as unknown as Record<string, unknown>,
    200,
    corsHeaders,
  );
}

function hasAuthenticatedUser(authData: unknown): boolean {
  return Boolean(
    authData &&
      typeof authData === "object" &&
      !Array.isArray(authData) &&
      (authData as { user?: unknown }).user,
  );
}
