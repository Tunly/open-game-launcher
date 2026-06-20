import { corsHeaders } from "../_shared/cors.ts";
import { parseCommunityArtworkModerationRequest } from "./contract.ts";
import {
  buildCommunityArtworkScanPacket,
  type CommunityArtworkScanInput,
  type CommunityArtworkScanPacket,
} from "./scan-policy.ts";

export type CommunityArtworkModerationRpcError = {
  message: string;
};

export interface CommunityArtworkModerationHandlerDeps {
  callModerationRpc: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<
    { data: unknown; error: CommunityArtworkModerationRpcError | null }
  >;
  getActiveModeratorRole: (userId: string) => Promise<string | null>;
  getUserId: (request: Request) => Promise<string | null>;
  logError?: (error: unknown) => void;
  readArtworkForScan: (
    artworkId: string,
  ) => Promise<CommunityArtworkScanInput | null>;
  scanCommunityArtwork: (
    artworkId: string,
    packet: CommunityArtworkScanPacket,
  ) => Promise<
    { data: unknown; error: CommunityArtworkModerationRpcError | null }
  >;
}

export const moderationCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...moderationCorsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleCommunityArtworkModeration(
  request: Request,
  deps: CommunityArtworkModerationHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: moderationCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await deps.getUserId(request);
    if (!userId) {
      return jsonResponse({ error: "Invalid or expired token." }, 401);
    }

    const parsed = parseCommunityArtworkModerationRequest(
      await request.json().catch(() => null),
    );
    if (parsed.status === "error") {
      return jsonResponse({ error: parsed.error }, parsed.statusCode);
    }

    const reviewerRole = await deps.getActiveModeratorRole(userId);
    if (!reviewerRole) {
      return jsonResponse(
        { error: "Community artwork reviewer is not active." },
        403,
      );
    }

    if (parsed.action === "scan_artwork") {
      const scanResult = await scanArtwork(parsed.args.p_artwork_id, deps);
      if (scanResult.error) {
        return jsonResponse(
          {
            action: parsed.action,
            error: scanResult.error,
            rpc: parsed.rpcName,
          },
          scanResult.status,
        );
      }

      return jsonResponse({
        action: parsed.action,
        data: scanResult.data,
        reviewerRole,
        rpc: parsed.rpcName,
      });
    }

    const rpcArgs = parsed.action === "review_artwork"
      ? { ...parsed.args, p_reviewer_user_id: userId }
      : parsed.args;
    const { data, error } = await deps.callModerationRpc(
      parsed.rpcName,
      rpcArgs,
    );
    if (error) {
      return jsonResponse(
        {
          action: parsed.action,
          error: error.message,
          rpc: parsed.rpcName,
        },
        400,
      );
    }

    return jsonResponse({
      action: parsed.action,
      data,
      reviewerRole,
      rpc: parsed.rpcName,
    });
  } catch (error) {
    deps.logError?.(error);
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Community artwork moderation failed.",
      },
      500,
    );
  }
}

async function scanArtwork(
  artworkId: string,
  deps: CommunityArtworkModerationHandlerDeps,
): Promise<{ data: unknown; error: string | null; status: number }> {
  const item = await deps.readArtworkForScan(artworkId);
  if (!item) {
    return {
      data: null,
      error: "Community artwork submission not found.",
      status: 404,
    };
  }

  const packet = buildCommunityArtworkScanPacket(item);
  const { data, error } = await deps.scanCommunityArtwork(artworkId, packet);
  if (error) {
    return {
      data: null,
      error: error.message,
      status: 400,
    };
  }

  return { data, error: null, status: 200 };
}
