import { createIgdbAssetsAdapters } from "./adapters.ts";
import { handleIgdbAssets } from "./handler.ts";

const adapters = createIgdbAssetsAdapters();
Deno.serve((request) => handleIgdbAssets(request, adapters));
