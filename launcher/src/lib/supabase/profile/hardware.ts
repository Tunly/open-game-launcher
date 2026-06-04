import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toHardware, toHardwarePayload } from "./schemas";
import { hardwareSchema, type HardwareInput } from "../../validation/profile";
import { getCurrentUserId, getHardwareFallback, saveHardwareFallback } from "./_shared";

export async function getUserHardware(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_hardware")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingSchemaError(error)) return getHardwareFallback(userId);
  handleError(error);
  return toHardware(data as UnknownRecord | null);
}

export async function updateMyHardware(input: HardwareInput) {
  const parsed = hardwareSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("user_hardware")
    .upsert({ user_id: userId, ...toHardwarePayload(parsed) })
    .select("*")
    .single();
  if (isMissingSchemaError(error)) return saveHardwareFallback(userId, parsed);
  handleError(error);
  return toHardware(data as UnknownRecord);
}
