import { useAuthContext } from "../app/providers/auth-context";

export function useCurrentUser() {
  return useAuthContext();
}
