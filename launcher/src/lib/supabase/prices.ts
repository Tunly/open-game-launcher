import { getSupabaseClient } from "./client";
import type { PriceAlert } from "../types/prices";

export async function getMyPriceAlerts(): Promise<PriceAlert[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("price_alerts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (error) return [];
  return (data ?? []) as unknown as PriceAlert[];
}
export async function createPriceAlert(
  gameId: string,
  platform: string,
  targetPriceCents: number,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  await client
    .from("price_alerts")
    .insert({ user_id: user.id, game_id: gameId, platform, target_price_cents: targetPriceCents });
}
