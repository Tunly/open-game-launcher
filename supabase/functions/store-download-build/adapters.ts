import type { StoreBuildQueryPlan } from "./download-ticket.ts";
import type {
  StoreBuildRow,
  StoreDownloadBuildHandlerDeps,
  StoreDownloadBuildLicenseLookup,
  StoreLicenseRow,
} from "./handler.ts";

const STORE_BUILD_SELECT =
  "id, product_id, version, platform, arch, file_name, size_bytes, sha256, storage_path, changelog, is_latest, uploaded_at, created_at";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  limit: (count: number) => SupabaseTableClient;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseTableClient;
  select: (columns: string) => SupabaseTableClient;
  then: PromiseLike<SupabaseQueryResult<unknown[]>>["then"];
};

type SupabaseStorageBucketClient = {
  createSignedUrl: (
    path: string,
    expiresIn: number,
    options: { download: string },
  ) => Promise<SupabaseQueryResult<{ signedUrl?: string }>>;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
  storage: {
    from: (bucket: string) => SupabaseStorageBucketClient;
  };
};

type CallerClient = {
  auth: {
    getUser: () => Promise<{
      data?: { user?: { id?: string } | null } | null;
      error?: unknown;
    }>;
  };
};

export type StoreDownloadBuildAdapterDeps = {
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => CallerClient;
  signedUrlTtlSeconds: number;
  storeBuildsBucket: string;
  supabaseAdmin: SupabaseAdminClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export type StoreDownloadBuildAdapters = Omit<
  StoreDownloadBuildHandlerDeps,
  "logError" | "now"
>;

export function createStoreDownloadBuildAdapters(
  deps: StoreDownloadBuildAdapterDeps,
): StoreDownloadBuildAdapters {
  return {
    createSignedBuildUrl: (build) =>
      createSignedBuildUrl(
        deps.supabaseAdmin,
        deps.storeBuildsBucket,
        deps.signedUrlTtlSeconds,
        build,
      ),
    findActiveLicense: (lookup) =>
      findActiveLicense(deps.supabaseAdmin, lookup),
    findStoreBuild: (buildPlan) =>
      findStoreBuild(deps.supabaseAdmin, buildPlan),
    getUserId: (request) => getUserId(deps, request),
    signedUrlTtlSeconds: deps.signedUrlTtlSeconds,
  };
}

async function getUserId(
  deps: Pick<
    StoreDownloadBuildAdapterDeps,
    "createClient" | "supabaseAnonKey" | "supabaseUrl"
  >,
  request: Request,
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  const callerClient = deps.createClient(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function findActiveLicense(
  supabaseAdmin: SupabaseAdminClient,
  lookup: StoreDownloadBuildLicenseLookup,
): Promise<StoreLicenseRow | null> {
  let licenseQuery = tableClient(supabaseAdmin, "store_licenses")
    .select("id, platform")
    .eq("user_id", lookup.userId)
    .eq("product_id", lookup.productId)
    .eq("is_revoked", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lookup.platform) {
    licenseQuery = licenseQuery.eq("platform", lookup.platform);
  }

  const { data: licenses, error: licenseError } = await licenseQuery;
  if (licenseError) {
    throw new Error(`Failed to read store license: ${licenseError.message}`);
  }

  return ((licenses ?? [])[0] as StoreLicenseRow | undefined) ?? null;
}

async function findStoreBuild(
  supabaseAdmin: SupabaseAdminClient,
  buildPlan: StoreBuildQueryPlan,
): Promise<StoreBuildRow | null> {
  let buildQuery = tableClient(supabaseAdmin, "store_builds")
    .select(STORE_BUILD_SELECT)
    .eq("product_id", buildPlan.productId)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (buildPlan.buildId) {
    buildQuery = buildQuery.eq("id", buildPlan.buildId);
  } else if (buildPlan.requireLatest) {
    buildQuery = buildQuery.eq("is_latest", true);
  }
  if (buildPlan.platform) {
    buildQuery = buildQuery.eq("platform", buildPlan.platform);
  }

  const { data: builds, error: buildError } = await buildQuery;
  if (buildError) {
    throw new Error(`Failed to read store build: ${buildError.message}`);
  }

  return ((builds ?? [])[0] as StoreBuildRow | undefined) ?? null;
}

async function createSignedBuildUrl(
  supabaseAdmin: SupabaseAdminClient,
  storeBuildsBucket: string,
  signedUrlTtlSeconds: number,
  build: StoreBuildRow,
): Promise<string> {
  const { data: signedUrl, error: signedUrlError } = await supabaseAdmin.storage
    .from(storeBuildsBucket)
    .createSignedUrl(build.storage_path, signedUrlTtlSeconds, {
      download: build.file_name,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    throw new Error(
      `Failed to create download URL: ${
        signedUrlError?.message ?? "unknown error"
      }`,
    );
  }

  return signedUrl.signedUrl;
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
