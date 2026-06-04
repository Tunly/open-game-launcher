import { z } from "zod";
import { useLocalStorageState } from "./useLocalStorageState";

export function useDebugMode(): [boolean, (checked: boolean) => void] {
  return useLocalStorageState("launcher.debugMode", false, z.boolean());
}
