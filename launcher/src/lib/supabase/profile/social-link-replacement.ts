import type { SocialLinksInput } from "../../validation/profile";
import {
  handleError,
  isMissingSchemaError,
  type SupabaseErrorLike,
  type UnknownRecord,
} from "../helpers";

type SocialLinksRpc = (
  functionName: "replace_my_social_links",
  args: { links_input: Array<Record<string, unknown>> },
) => Promise<{ data: unknown; error: SupabaseErrorLike | null }>;

type RpcCapableClient = {
  rpc: unknown;
};

export async function replaceSocialLinksAtomically(
  client: RpcCapableClient,
  links: SocialLinksInput,
): Promise<UnknownRecord[]> {
  const payload = links.map((link, index) => ({
    label: link.label ?? null,
    platform: link.platform,
    sort_order: link.sortOrder ?? index,
    url: link.url,
    visibility: link.visibility ?? "public",
  }));
  const rpc = client.rpc as SocialLinksRpc;
  const { data, error } = await rpc("replace_my_social_links", { links_input: payload });

  if (isMissingSchemaError(error)) {
    throw new Error(
      "Atomic social-link replacement is not installed yet. Existing social links were left unchanged.",
    );
  }
  handleError(error);

  return Array.isArray(data) ? (data as UnknownRecord[]) : [];
}
