import { router } from "./router";

export async function handleInstallDeepLink(_params: Record<string, string>, storeSlug: string) {
  if (storeSlug) {
    router.navigate(`/store?slug=${storeSlug}&install=1`);
  }
}
