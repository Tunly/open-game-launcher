import type { ReactNode } from "react";

import { LibraryContext, type LibraryContextValue } from "./LibraryContext";

export function LibraryProvider({
  value,
  children,
}: {
  value: LibraryContextValue;
  children: ReactNode;
}) {
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
