import { getSupabaseClient } from "./client";
import type { StoreBuild, StoreCartItem, StoreLicense, StoreProduct } from "../types/store";
import type { DeveloperApplication } from "../types/store";

const PRODUCT_SELECT = `id, title, slug, description, short_description, developer_id, publisher,
  release_date, genres, tags, platforms, price_cents, discount_percent, cover_image_url,
  screenshots, trailer_url, min_system_requirements, rec_system_requirements,
  rating, ratings_count, downloads_count, status, metadata, created_at, updated_at`;
const CART_SELECT = `id, user_id, product_id, quantity, added_at`;
const BUILD_SELECT = `id, product_id, version, platform, arch, file_name, size_bytes,
  sha256, storage_path, changelog, is_latest, uploaded_at, created_at`;
const LICENSE_SELECT = `id, user_id, product_id, order_id, license_key, platform,
  device_id, activations_left, expires_at, is_revoked, created_at`;

export async function listPublishedProducts(): Promise<StoreProduct[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as unknown as StoreProduct[];
}

export async function getStoreProduct(slug: string): Promise<StoreProduct | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .single();
  if (error) return null;
  return data as unknown as StoreProduct;
}

export async function listDeveloperProducts(): Promise<StoreProduct[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("developer_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as unknown as StoreProduct[];
}

export async function createStoreProduct(
  title: string,
  slug: string,
): Promise<StoreProduct | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("store_products")
    .insert({ developer_id: user.id, title, slug, status: "draft" })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StoreProduct;
}

// --- Cart ---
export async function getCartItems(): Promise<StoreCartItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_cart_items")
    .select(CART_SELECT)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as unknown as StoreCartItem[];
}

export async function addToCart(productId: string, quantity = 1): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_cart_items")
    .upsert(
      { user_id: user.id, product_id: productId, quantity },
      { onConflict: "user_id,product_id" },
    );
  if (error) throw new Error(error.message);
}

export async function removeFromCart(productId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_cart_items")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

// --- Builds ---
export async function getLatestBuild(
  productId: string,
  platform: string,
): Promise<StoreBuild | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("store_builds")
    .select(BUILD_SELECT)
    .eq("product_id", productId)
    .eq("platform", platform)
    .eq("is_latest", true)
    .single();
  if (error) return null;
  return data as unknown as StoreBuild;
}

// --- Licenses ---
export async function getMyLicenses(): Promise<StoreLicense[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_licenses")
    .select(LICENSE_SELECT)
    .eq("user_id", user.id)
    .eq("is_revoked", false);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as unknown as StoreLicense[];
}

// --- Developer ---
export async function submitDeveloperApplication(
  studioName: string,
  website: string | null,
  description: string | null,
): Promise<DeveloperApplication | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("developer_applications")
    .insert({ user_id: user.id, studio_name: studioName, website, description })
    .select("id, user_id, studio_name, website, description, status, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as DeveloperApplication;
}

export async function getDeveloperApplication(): Promise<DeveloperApplication | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("developer_applications")
    .select("id, user_id, studio_name, website, description, status, created_at, updated_at")
    .eq("user_id", user.id)
    .single();
  if (error) return null;
  return data as unknown as DeveloperApplication;
}
