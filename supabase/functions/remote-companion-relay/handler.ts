import { corsHeaders } from "../_shared/cors.ts";
import {
  buildRemoteCompanionRelayErrorContract,
  buildRemoteCompanionRelayRpcErrorContract,
  guardRemoteCompanionRelayAuth,
  guardRemoteCompanionRelayMethod,
  parseRemoteCompanionRelayRequest,
} from "./contract.ts";

export type RemoteCompanionRelayRpcError = {
  message: string;
};

export interface RemoteCompanionRelayCallerClient {
  getUser: () => Promise<{ data: unknown; error: unknown }>;
  rpc: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RemoteCompanionRelayRpcError | null }>;
}

export interface RemoteCompanionRelayHandlerDeps {
  createCallerClient: (request: Request) => RemoteCompanionRelayCallerClient;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleRemoteCompanionRelay(
  request: Request,
  deps: RemoteCompanionRelayHandlerDeps,
): Promise<Response> {
  const methodGuard = guardRemoteCompanionRelayMethod(request.method);
  if (methodGuard.status === "options") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (methodGuard.status === "error") {
    return jsonResponse(methodGuard.body, methodGuard.statusCode);
  }

  const client = deps.createCallerClient(request);
  const { data: authData, error: authError } = await client.getUser();
  const authGuard = guardRemoteCompanionRelayAuth(authData, authError);
  if (authGuard.status === "error") {
    return jsonResponse(authGuard.body, authGuard.statusCode);
  }

  const body = await request.json().catch(() => null);
  const parsed = parseRemoteCompanionRelayRequest(body);
  if (parsed.status === "error") {
    const errorContract = buildRemoteCompanionRelayErrorContract(
      parsed.error,
      parsed.statusCode,
    );
    return jsonResponse(errorContract.body, errorContract.statusCode);
  }

  const { data, error } = await client.rpc(parsed.rpcName, parsed.args);
  if (error) {
    const errorContract = buildRemoteCompanionRelayRpcErrorContract({
      action: parsed.action,
      errorMessage: error.message,
      rpcName: parsed.rpcName,
    });
    return jsonResponse(errorContract.body, errorContract.statusCode);
  }

  return jsonResponse({
    action: parsed.action,
    data,
    rpc: parsed.rpcName,
  });
}
