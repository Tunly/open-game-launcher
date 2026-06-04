import { useContext } from "react";

import { LibraryContext, type LibraryContextValue } from "./LibraryContext";

export function useLibraryContext(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibraryContext must be used within a LibraryProvider");
  }
  return ctx;
}
