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

/**
 * Stable declarative ids for pipeline consumers. Consumers must not compare
 * merger functions by reference — use the id from `onMergerApplied` instead.
 */
export function mergerId(merger: ProviderMerger): string {
  return merger.name
    .replace(/^merge/, "")
    .replace(/Owned$|Catalog$/, "")
    .toLowerCase();
}
