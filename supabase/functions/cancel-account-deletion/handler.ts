import {
  type AccountDeletionAuthResult,
  accountDeletionJsonResponse,
  accountDeletionMethodNotAllowed,
  handleAccountDeletionOptions,
} from "../_shared/account-deletion-handler.ts";
import { buildCancelAccountDeletionMutation } from "../_shared/account-deletion-contract.ts";

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

export interface CancelAccountDeletionHandlerDeps {
  authenticateRequest: (request: Request) => Promise<AccountDeletionAuthResult>;
  cancelDeletionRequest: (
    mutation: ReturnType<typeof buildCancelAccountDeletionMutation>,
  ) => Promise<DeletionRequestRow>;
  findPendingRequestId: (userId: string) => Promise<string | null>;
  now: () => Date;
}

export async function handleCancelAccountDeletion(
  request: Request,
  deps: CancelAccountDeletionHandlerDeps,
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

  const pendingId = await deps.findPendingRequestId(authResult.userId);
  if (!pendingId) {
    return accountDeletionJsonResponse({ request: null }, 404);
  }

  const mutation = buildCancelAccountDeletionMutation({
    cancelledAt: deps.now().toISOString(),
    requestId: pendingId,
    userId: authResult.userId,
  });
  const data = await deps.cancelDeletionRequest(mutation);

  return accountDeletionJsonResponse({ request: data });
}
