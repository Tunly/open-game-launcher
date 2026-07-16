import { requireAuthenticatedRequest } from "../_shared/privacy.ts";
import { createLinkSteamAccountAdapters } from "./adapters.ts";
import { handleLinkSteamAccount } from "./handler.ts";

const adapters = createLinkSteamAccountAdapters({
  authenticateRequest: requireAuthenticatedRequest,
});

Deno.serve((request) => handleLinkSteamAccount(request, adapters));
