import {
  privacyAdminClient,
  requireAuthenticatedRequest,
} from "../_shared/privacy.ts";
import { createRequestAccountDeletionAdapters } from "./adapters.ts";
import { handleRequestAccountDeletion } from "./handler.ts";
const adapters = createRequestAccountDeletionAdapters({
  authenticateRequest: requireAuthenticatedRequest,
  supabaseAdmin: privacyAdminClient,
});

Deno.serve((request) =>
  handleRequestAccountDeletion(request, {
    ...adapters,
  })
);
