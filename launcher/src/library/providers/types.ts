import type { Dispatch, SetStateAction } from "react";
import type { Game } from "../../lib/types";

export interface MergeContext {
  forceRefresh: boolean;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
  shouldApplyResult: () => boolean;
}

export interface ProviderResult {
  games: Game[];
  warnings: string[];
  statusMessage: string | null;
}

export type ProviderMerger = (games: Game[], context: MergeContext) => Promise<ProviderResult>;
