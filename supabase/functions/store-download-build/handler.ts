import { corsHeaders } from "../_shared/cors.ts";
import {
  buildStoreBuildQueryPlan,
  readStoreDownloadBuildRequest,
  type StoreBuildQueryPlan,
} from "./download-ticket.ts";

export type StoreBuildRow = {
  arch: string;
  changelog: string | null;
  created_at: string;
  file_name: string;
  id: string;
  is_latest: boolean;
  platform: string;
  product_id: string;
  sha256: string | null;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
  version: string;
};

export type StoreLicenseRow = {
  id: string;
  platform: string;
};

export type StoreDownloadBuildLicenseLookup = {
  platform: string | null;
  productId: string;
  userId: string;
};

export interface StoreDownloadBuildHandlerDeps {
  createSignedBuildUrl: (build: StoreBuildRow) => Promise<string>;
  findActiveLicense: (
    lookup: StoreDownloadBuildLicenseLookup,
  ) => Promise<StoreLicenseRow | null>;
  findStoreBuild: (
    queryPlan: StoreBuildQueryPlan,
  ) => Promise<StoreBuildRow | null>;
  getUserId: (request: Request) => Promise<string | null>;
  logError?: (message: string, error: unknown) => void;
  now?: () => Date;
  signedUrlTtlSeconds: number;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapBuild(row: StoreBuildRow) {
  return {
    arch: row.arch,
    changelog: row.changelog,
    createdAt: row.created_at,
    fileName: row.file_name,
    id: row.id,
    isLatest: row.is_latest,
    platform: row.platform,
    productId: row.product_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    version: row.version,
  };
}

export async function handleStoreDownloadBuild(
  request: Request,
  deps: StoreDownloadBuildHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const userId = await deps.getUserId(request);
    if (!userId) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const parsedRequest = readStoreDownloadBuildRequest(
      await request.json().catch(() => ({})),
    );
    if (parsedRequest.status === "error") {
      return jsonResponse(
        { error: parsedRequest.error },
        parsedRequest.statusCode,
      );
    }

    const license = await deps.findActiveLicense({
      platform: parsedRequest.platform,
      productId: parsedRequest.productId,
      userId,
    });
    if (!license) {
      return jsonResponse({ error: "No active license for this product" }, 403);
    }

    const buildPlan = buildStoreBuildQueryPlan({
      buildId: parsedRequest.buildId,
      platform: parsedRequest.platform ?? license.platform,
      productId: parsedRequest.productId,
    });
    const build = await deps.findStoreBuild(buildPlan);
    if (!build) {
      return jsonResponse({ error: "No downloadable build is available" }, 404);
    }

    const signedUrl = await deps.createSignedBuildUrl(build);

    return jsonResponse({
      build: mapBuild(build),
      expiresAt: new Date(
        (deps.now?.() ?? new Date()).getTime() +
          deps.signedUrlTtlSeconds * 1000,
      ).toISOString(),
      licenseId: license.id,
      url: signedUrl,
    });
  } catch (error) {
    if (deps.logError) {
      deps.logError("Store download build error:", error);
    } else {
      console.error("Store download build error:", error);
    }
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Download ticket failed",
      },
      500,
    );
  }
}
