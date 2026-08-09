import { createRawgStoreCatalogAdapters } from "./adapters.ts";
import { handleRawgStoreCatalog } from "./handler.ts";

const adapters = createRawgStoreCatalogAdapters();

Deno.serve((request) => handleRawgStoreCatalog(request, adapters));
