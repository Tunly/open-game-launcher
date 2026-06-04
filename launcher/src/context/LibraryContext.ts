import { createContext } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { UseLibrarySyncResult } from "../hooks/library/useLibrarySync";
import type { UseLibraryFiltersResult } from "../hooks/library/useLibraryFilters";
import type { UseManualCollectionsResult } from "../hooks/library/useManualCollections";
import type { UseDynamicCollectionsResult } from "../hooks/library/useDynamicCollections";
import type { UseAchievementAutoSyncResult } from "../hooks/library/useAchievementAutoSync";
import type { UseProviderPickingResult } from "../hooks/library/useProviderPicking";

export interface LibraryContextValue {
  sync: UseLibrarySyncResult;
  manual: UseManualCollectionsResult;
  filters: UseLibraryFiltersResult;
  dynamic: UseDynamicCollectionsResult;
  achievements: UseAchievementAutoSyncResult;
  picking: UseProviderPickingResult;
  statusMessage: string | null;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);
