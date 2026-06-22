import { router } from "./router";
import { getErrorMessage } from "../lib/formatters";
import { startDownload } from "../lib/launcher";
import {
  buildRemoteInstallHandoffSearch,
  parseRemoteInstallHandoff,
} from "../lib/remote-install-handoff";
import {
  appendRemoteInstallHandoffHistory,
  createRemoteInstallHandoffHistoryRecord,
} from "../lib/remote-install-history";

export async function handleInstallDeepLink(params: Record<string, string>, storeSlug: string) {
  const handoffResult = parseRemoteInstallHandoff(params);
  if (handoffResult.status === "valid") {
    const { handoff } = handoffResult;
    const handoffSource = handoff.source ?? "desktop-deep-link";
    appendRemoteInstallHandoffHistory(
      createRemoteInstallHandoffHistoryRecord({
        handoff,
        source: handoffSource,
        status: "pending",
      }),
    );
    void router.navigate(
      `/downloads?${buildRemoteInstallHandoffSearch({
        gameId: handoff.gameId,
        status: "pending",
        title: handoff.title,
      })}`,
    );

    try {
      const response = await startDownload(
        handoff.gameId,
        handoff.title,
        handoff.downloadUrl,
        handoff.downloadSha256,
        handoff.installManifestUrl,
        handoff.installManifestSha256,
      );
      appendRemoteInstallHandoffHistory(
        createRemoteInstallHandoffHistoryRecord({
          gameId: response.gameId,
          handoff,
          message: response.message,
          source: handoffSource,
          status: "accepted",
        }),
      );
      void router.navigate(
        `/downloads?${buildRemoteInstallHandoffSearch({
          gameId: response.gameId,
          message: response.message,
          status: "accepted",
          title: handoff.title,
        })}`,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      appendRemoteInstallHandoffHistory(
        createRemoteInstallHandoffHistoryRecord({
          handoff,
          message,
          source: handoffSource,
          status: "failed",
        }),
      );
      void router.navigate(
        `/downloads?${buildRemoteInstallHandoffSearch({
          gameId: handoff.gameId,
          message,
          status: "failed",
          title: handoff.title,
        })}`,
      );
    }
    return;
  }

  if (handoffResult.status === "invalid") {
    const source =
      params.source === "web-dashboard" || params.source === "desktop-deep-link"
        ? params.source
        : "desktop-deep-link";
    appendRemoteInstallHandoffHistory(
      createRemoteInstallHandoffHistoryRecord({
        message: handoffResult.message,
        params,
        source,
        status: "failed",
      }),
    );
    void router.navigate(
      `/downloads?${buildRemoteInstallHandoffSearch({
        gameId: params.gameId,
        message: handoffResult.message,
        status: "failed",
        title: params.title,
      })}`,
    );
    return;
  }

  if (storeSlug) router.navigate(`/store?slug=${storeSlug}&install=1`);
}
