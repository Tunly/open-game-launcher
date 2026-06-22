import { requireEnv } from "../_shared/env.ts";
import { privacyAdminClient } from "../_shared/privacy.ts";
import { createProcessAccountDeletionsAdapters } from "./adapters.ts";
import { handleProcessAccountDeletions } from "./handler.ts";

const adapters = createProcessAccountDeletionsAdapters({
  getExpectedSecret: () => requireEnv("ACCOUNT_DELETION_PROCESSOR_SECRET"),
  supabaseAdmin: privacyAdminClient,
});

Deno.serve((request) =>
  handleProcessAccountDeletions(request, {
    ...adapters,
  })
);
