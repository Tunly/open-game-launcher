import { corsHeaders } from "../_shared/cors.ts";
import {
  buildMobilePushRegistrationMutationPlan,
  readMobilePushRegistrationRequest,
  type MobilePushRegistrationMutationPlan,
} from "./contract.ts";

export type MobilePushRegistrationApplyResult =
  | {
      action: "upsert";
      registrationId: string;
      updatedAt: string | null;
    }
  | {
      action: "delete";
      deleted: boolean;
      registrationId: string;
    };

export interface MobilePushRegistrationHandlerDeps {
  applyMutation: (
    plan: MobilePushRegistrationMutationPlan,
  ) => Promise<MobilePushRegistrationApplyResult>;
  getAuthenticatedUserId: (request: Request) => Promise<string | null>;
}

const mobilePushRegistrationCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...mobilePushRegistrationCorsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

export async function handleMobilePushRegistrationRequest(
  request: Request,
  deps: MobilePushRegistrationHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: mobilePushRegistrationCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await deps.getAuthenticatedUserId(request);
    if (!userId) {
      return jsonResponse({ error: "Invalid or expired token." }, 401);
    }

    const parsed = readMobilePushRegistrationRequest(
      await request.json().catch(() => null),
    );
    if (parsed.status === "error") {
      return jsonResponse({ error: parsed.error }, parsed.statusCode);
    }

    const plan = buildMobilePushRegistrationMutationPlan(userId, parsed);
    if (plan.status === "error") {
      return jsonResponse({ error: plan.error }, plan.statusCode);
    }

    const mutation = await deps.applyMutation(plan);
    if (plan.action === "delete") {
      return jsonResponse({
        action: "unregister",
        deleted: mutation.action === "delete" ? mutation.deleted : false,
        pushDelivery: "not_sent",
        rawTokenStored: false,
        registrationId: plan.registrationId,
        status: "unregistered",
      });
    }

    if (parsed.action !== "register") {
      return jsonResponse(
        { error: "Mobile push registration action mismatch." },
        500,
      );
    }

    return jsonResponse({
      action: "register",
      consentGranted: true,
      permissionStatus: parsed.permissionStatus,
      platform: parsed.platform,
      pushDelivery: "not_sent",
      rawTokenStored: false,
      registrationId:
        mutation.action === "upsert" ? mutation.registrationId : null,
      status: "registered",
      tokenHint: parsed.tokenHint,
      updatedAt: mutation.action === "upsert" ? mutation.updatedAt : null,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mobile push registration failed.",
      },
      500,
    );
  }
}
