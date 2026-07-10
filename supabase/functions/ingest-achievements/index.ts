import { requireAuthenticatedRequest } from "../_shared/privacy.ts";
import { createAchievementIngestionAdapters } from "./adapters.ts";
import { handleAchievementIngestion } from "./handler.ts";

const adapters = createAchievementIngestionAdapters({
  authenticateRequest: requireAuthenticatedRequest,
  getEnv: (name) => Deno.env.get(name),
});

Deno.serve((request) => handleAchievementIngestion(request, adapters));
