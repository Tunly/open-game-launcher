import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthContextValue {
  error: string | null;
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuthContext must be used inside AuthProvider.");
  }

  return value;
}
