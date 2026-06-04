import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

type EventFilter = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseSupabaseSubscriptionOptions<T extends Record<string, unknown>> {
  table: string;
  schema?: string;
  event?: EventFilter;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<T>) => void;
  enabled?: boolean;
}

export function useSupabaseSubscription<T extends Record<string, unknown>>({
  table,
  schema = "public",
  event = "*",
  filter,
  callback,
  enabled = true,
}: UseSupabaseSubscriptionOptions<T>) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel(`subscription:${schema}:${table}:${event}`)
      .on(
        "postgres_changes" as never,
        {
          event,
          schema,
          table,
          filter,
        } as never,
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload);
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [table, schema, event, filter, enabled]);
}
