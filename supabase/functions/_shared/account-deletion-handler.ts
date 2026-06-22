export const accountDeletionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type AccountDeletionAuthResult = { userId: string } | Response;

export function accountDeletionJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...accountDeletionCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function handleAccountDeletionOptions(request: Request) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response("ok", { headers: accountDeletionCorsHeaders });
}

export function accountDeletionMethodNotAllowed() {
  return accountDeletionJsonResponse({ error: "Method not allowed." }, 405);
}
