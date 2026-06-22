import {
  type AccountDeletionAuthResult,
  accountDeletionJsonResponse,
  accountDeletionMethodNotAllowed,
  handleAccountDeletionOptions,
} from "../_shared/account-deletion-handler.ts";
import {
  isPendingAccountDeletionConflict,
  normalizeAccountDeletionReason,
} from "../_shared/account-deletion-contract.ts";

export type DeletionRequestRow = {
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  id: string;
  reason: string | null;
  requested_at: string;
  scheduled_at: string;
  status: "pending" | "processing" | "cancelled" | "completed" | "failed";
  updated_at: string;
  user_id: string;
};

export type CreateDeletionRequestInput = {
  reason: string | null;
  requestMetadata: {
    source: "edge-function";
    user_agent: string | null;
  };
  userId: string;
};

export interface RequestAccountDeletionHandlerDeps {
  authenticateRequest: (request: Request) => Promise<AccountDeletionAuthResult>;
  createDeletionRequest: (
    input: CreateDeletionRequestInput,
  ) => Promise<DeletionRequestRow>;
  findActiveRequest: (userId: string) => Promise<DeletionRequestRow | null>;
}

export async function handleRequestAccountDeletion(
  request: Request,
  deps: RequestAccountDeletionHandlerDeps,
): Promise<Response> {
  const optionsResponse = handleAccountDeletionOptions(request);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (request.method !== "POST") {
    return accountDeletionMethodNotAllowed();
  }

  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  const body = await request.json().catch(() => null);
  const reasonResult = normalizeAccountDeletionReason(body);
  if (!reasonResult.ok) {
    return accountDeletionJsonResponse(
      { error: reasonResult.error },
      reasonResult.statusCode,
    );
  }

  const existing = await deps.findActiveRequest(authResult.userId);
  if (existing) {
    return accountDeletionJsonResponse({ request: existing });
  }

  try {
    const data = await deps.createDeletionRequest({
      reason: reasonResult.reason,
      requestMetadata: {
        source: "edge-function",
        user_agent: request.headers.get("user-agent") ?? null,
      },
      userId: authResult.userId,
    });

    return accountDeletionJsonResponse({ request: data }, 201);
  } catch (error) {
    if (isPendingAccountDeletionConflict(error)) {
      const pending = await deps.findActiveRequest(authResult.userId);
      if (!pending) {
        throw new Error(
          "Active account deletion request not found after conflict.",
        );
      }

      return accountDeletionJsonResponse({ request: pending });
    }

    throw error;
  }
}
