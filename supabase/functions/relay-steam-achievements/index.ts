import { requireAuthenticatedRequest } from "../_shared/privacy.ts";
import { createSteamAchievementRelayAdapters } from "./adapters.ts";
import { handleSteamAchievementRelay } from "./handler.ts";

const adapters = createSteamAchievementRelayAdapters({
  authenticateRequest: requireAuthenticatedRequest,
});

Deno.serve((request) => handleSteamAchievementRelay(request, adapters));
