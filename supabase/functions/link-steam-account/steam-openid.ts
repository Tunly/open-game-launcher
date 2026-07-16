export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_OPENID_NAMESPACE = "http://specs.openid.net/auth/2.0";
const RESPONSE_NONCE_MAX_AGE_MS = 20 * 60 * 1000;
const RESPONSE_NONCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type VerifiedSteamIdentity = {
  claimedId: string;
  responseNonce: string;
  steamId: string;
  verifiedAt: string;
};

export type SteamOpenIdDeps = {
  fetch?: typeof fetch;
  now?: () => Date;
};

export class SteamOpenIdError extends Error {
  code: string;
  status: number;

  constructor(message: string, status = 400, code = "invalid_openid_response") {
    super(message);
    this.name = "SteamOpenIdError";
    this.code = code;
    this.status = status;
  }
}

export async function verifySteamOpenIdResponse(
  openidResponseUrl: string,
  deps: SteamOpenIdDeps = {},
): Promise<VerifiedSteamIdentity> {
  const now = deps.now?.() ?? new Date();
  const responseUrl = parseResponseUrl(openidResponseUrl);
  rejectDuplicateOpenIdParameters(responseUrl);

  if (
    requiredParameter(responseUrl, "openid.ns") !== STEAM_OPENID_NAMESPACE ||
    requiredParameter(responseUrl, "openid.mode") !== "id_res" ||
    requiredParameter(responseUrl, "openid.op_endpoint") !==
      STEAM_OPENID_ENDPOINT
  ) {
    throw new SteamOpenIdError(
      "Steam OpenID response fields do not match the provider contract.",
      401,
      "openid_contract_mismatch",
    );
  }
  validateReturnTo(
    responseUrl,
    requiredParameter(responseUrl, "openid.return_to"),
  );

  const claimedId = requiredParameter(responseUrl, "openid.claimed_id");
  if (requiredParameter(responseUrl, "openid.identity") !== claimedId) {
    throw new SteamOpenIdError(
      "Steam OpenID identity does not match its claimed id.",
      401,
      "openid_identity_mismatch",
    );
  }
  const steamId = steamIdFromClaimedId(claimedId);
  validateSignedFields(requiredParameter(responseUrl, "openid.signed"));
  const responseNonce = requiredParameter(responseUrl, "openid.response_nonce");
  validateResponseNonce(responseNonce, now);
  requiredParameter(responseUrl, "openid.assoc_handle");
  requiredParameter(responseUrl, "openid.sig");

  const verificationBody = new URLSearchParams();
  for (const [key, value] of responseUrl.searchParams.entries()) {
    if (key.startsWith("openid.")) verificationBody.set(key, value);
  }
  verificationBody.set("openid.mode", "check_authentication");

  let verificationResponse: Response;
  try {
    verificationResponse = await (deps.fetch ?? fetch)(STEAM_OPENID_ENDPOINT, {
      body: verificationBody,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  } catch {
    throw new SteamOpenIdError(
      "Steam OpenID verification is temporarily unavailable.",
      502,
      "steam_openid_unavailable",
    );
  }
  if (!verificationResponse.ok) {
    throw new SteamOpenIdError(
      "Steam rejected the OpenID verification request.",
      502,
      "steam_openid_rejected",
    );
  }
  const verification = parseKeyValueResponse(await verificationResponse.text());
  if (verification.get("is_valid") !== "true") {
    throw new SteamOpenIdError(
      "Steam could not verify this OpenID response.",
      401,
      "steam_openid_invalid",
    );
  }

  return {
    claimedId,
    responseNonce,
    steamId,
    verifiedAt: now.toISOString(),
  };
}

function parseResponseUrl(value: string) {
  if (!value || value.length > 16_384) {
    throw new SteamOpenIdError("Steam OpenID response URL is invalid.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SteamOpenIdError("Steam OpenID response URL is invalid.");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "localhost" ||
    url.port !== "18234" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.getAll("state").length !== 1 ||
    !url.searchParams.get("state")?.trim()
  ) {
    throw new SteamOpenIdError("Steam OpenID response URL is invalid.");
  }
  return url;
}

function validateReturnTo(responseUrl: URL, rawReturnTo: string) {
  let returnTo: URL;
  try {
    returnTo = new URL(rawReturnTo);
  } catch {
    throw new SteamOpenIdError(
      "Steam OpenID return URL is invalid.",
      401,
      "return_to_mismatch",
    );
  }
  if (
    responseUrl.protocol !== returnTo.protocol ||
    responseUrl.host !== returnTo.host ||
    responseUrl.pathname !== returnTo.pathname
  ) {
    throw new SteamOpenIdError(
      "Steam OpenID return URL does not match the response URL.",
      401,
      "return_to_mismatch",
    );
  }
  for (const [key, value] of returnTo.searchParams.entries()) {
    if (
      !key.startsWith("openid.") && responseUrl.searchParams.get(key) !== value
    ) {
      throw new SteamOpenIdError(
        "Steam OpenID return URL does not match the response URL.",
        401,
        "return_to_mismatch",
      );
    }
  }
}

function rejectDuplicateOpenIdParameters(url: URL) {
  const names = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (key.startsWith("openid.") && names.has(key)) {
      throw new SteamOpenIdError(
        "Steam OpenID response contains duplicate fields.",
      );
    }
    names.add(key);
  }
}

function requiredParameter(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new SteamOpenIdError(`Steam OpenID response is missing ${name}.`);
  }
  return value;
}

function steamIdFromClaimedId(claimedId: string) {
  const match = claimedId.match(
    /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})\/?$/,
  );
  if (!match) {
    throw new SteamOpenIdError(
      "Steam claimed id is invalid.",
      401,
      "invalid_steam_identity",
    );
  }
  return match[1];
}

function validateSignedFields(value: string) {
  const signed = new Set(value.split(",").map((field) => field.trim()));
  for (
    const required of [
      "op_endpoint",
      "claimed_id",
      "identity",
      "return_to",
      "response_nonce",
      "assoc_handle",
    ]
  ) {
    if (!signed.has(required)) {
      throw new SteamOpenIdError(
        "Steam OpenID response omits a required signed field.",
        401,
        "openid_unsigned_field",
      );
    }
  }
}

function validateResponseNonce(value: string, now: Date) {
  const timestamp = Date.parse(value.slice(0, 20));
  if (
    !Number.isFinite(timestamp) ||
    timestamp < now.getTime() - RESPONSE_NONCE_MAX_AGE_MS ||
    timestamp > now.getTime() + RESPONSE_NONCE_FUTURE_TOLERANCE_MS
  ) {
    throw new SteamOpenIdError(
      "Steam OpenID response nonce is stale or invalid.",
      401,
      "invalid_response_nonce",
    );
  }
}

function parseKeyValueResponse(value: string) {
  return new Map(
    value.split(/\r?\n/).flatMap((line) => {
      const separator = line.indexOf(":");
      return separator > 0
        ? [
          [
            line.slice(0, separator).trim(),
            line.slice(separator + 1).trim(),
          ] as const,
        ]
        : [];
    }),
  );
}
