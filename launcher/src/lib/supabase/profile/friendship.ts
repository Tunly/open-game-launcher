import { getCurrentSessionUserId, getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type SupabaseErrorLike } from "../helpers";

type CurrentFriendshipRpc = (
  functionName: "is_current_user_friend",
  args: { profile_user_id: string },
) => Promise<{ data: unknown; error: SupabaseErrorLike | null }>;

export async function isCurrentUserFriendWith(profileUserId: string): Promise<boolean> {
  const targetUserId = profileUserId.trim();
  const currentUserId = await getCurrentSessionUserId();
  if (!targetUserId || !currentUserId || targetUserId === currentUserId) {
    return false;
  }

  const client = getSupabaseClient();
  const rpc = client.rpc as unknown as CurrentFriendshipRpc;
  const { data, error } = await rpc("is_current_user_friend", {
    profile_user_id: targetUserId,
  });
  if (isMissingSchemaError(error)) {
    return false;
  }
  handleError(error);
  return data === true;
}
