import {
  privacyAdminClient,
  requireAuthenticatedRequest,
} from "../_shared/privacy.ts";
import { createExportUserDataAdapters } from "./adapters.ts";
import { handleExportUserData } from "./handler.ts";
const adapters = createExportUserDataAdapters({
  adminClient: privacyAdminClient,
  authenticateRequest: requireAuthenticatedRequest,
});

Deno.serve((request) =>
  handleExportUserData(request, {
    ...adapters,
    now: () => new Date(),
  })
);
