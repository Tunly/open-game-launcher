const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const buildPlatforms = new Set(["windows", "macos", "linux"]);

export type StoreDownloadBuildRequest =
  | {
      buildId: string | null;
      platform: string | null;
      productId: string;
      status: "ok";
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    };

export interface StoreBuildQueryPlan {
  buildId: string | null;
  platform: string | null;
  productId: string;
  requireLatest: boolean;
}

export function readStoreDownloadBuildRequest(
  body: unknown,
): StoreDownloadBuildRequest {
  const record = readRecord(body);
  const productId = cleanUuid(record?.product_id);
  if (!productId) {
    return {
      error: "product_id is required",
      status: "error",
      statusCode: 400,
    };
  }

  const rawBuildId = record?.build_id ?? record?.buildId;
  const buildId = cleanOptionalUuid(rawBuildId);
  if (buildId === false) {
    return {
      error: "build_id must be a valid UUID",
      status: "error",
      statusCode: 400,
    };
  }

  return {
    buildId,
    platform: cleanPlatform(record?.platform),
    productId,
    status: "ok",
  };
}

export function buildStoreBuildQueryPlan(input: {
  buildId?: string | null;
  platform?: string | null;
  productId: string;
}): StoreBuildQueryPlan {
  return {
    buildId: input.buildId ?? null,
    platform: cleanPlatform(input.platform),
    productId: input.productId,
    requireLatest: !input.buildId,
  };
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function cleanOptionalUuid(value: unknown): string | null | false {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return false;
  if (!value.trim()) return null;
  return cleanUuid(value) ?? false;
}

function cleanPlatform(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return buildPlatforms.has(normalized) ? normalized : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
