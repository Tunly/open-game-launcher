import { createRawgAssetsAdapters } from "./adapters.ts";
import { handleRawgAssets } from "./handler.ts";

const adapters = createRawgAssetsAdapters();

Deno.serve((request) => handleRawgAssets(request, adapters));
