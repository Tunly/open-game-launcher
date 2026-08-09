import { createSyncStoreCatalogAdapters } from "./adapters.ts";
import { handleSyncStoreCatalog } from "./handler.ts";

const adapters = createSyncStoreCatalogAdapters();

Deno.serve((request) => handleSyncStoreCatalog(request, adapters));
