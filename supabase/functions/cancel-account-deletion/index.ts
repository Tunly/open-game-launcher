import {
  privacyAdminClient,
  requireAuthenticatedRequest,
} from "../_shared/privacy.ts";
import { createCancelAccountDeletionAdapters } from "./adapters.ts";
import { handleCancelAccountDeletion } from "./handler.ts";
const adapters = createCancelAccountDeletionAdapters({
  authenticateRequest: requireAuthenticatedRequest,
  supabaseAdmin: privacyAdminClient,
});

Deno.serve((request) =>
  handleCancelAccountDeletion(request, {
    ...adapters,
    now: () => new Date(),
  })
);
