import { isTauri } from "@tauri-apps/api/core";

import { useDownloadStore } from "../stores/downloadStore";
import { getDownloadQueue, pollRemoteCompanionInstallJobsOnce } from "./launcher";
import { STORAGE_KEYS } from "./storage-keys";

export const REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS = 60_000;
const REMOTE_COMPANION_POLL_LIMIT = 5;

type RemoteCompanionPollResult = Awaited<ReturnType<typeof pollRemoteCompanionInstallJobsOnce>>;

let remoteCompanionPollInflight: Promise<RemoteCompanionPollResult> | null = null;

export function readRemoteDownloadAlwaysOnConfigured(): boolean {
  try {
    return (
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.REMOTE_DOWNLOAD_ALWAYS_ON_CONFIGURED) ?? "false",
      ) === true
    );
  } catch {
    return false;
  }
}

export function runRemoteCompanionInstallJobPollOnce(
  limit = REMOTE_COMPANION_POLL_LIMIT,
): Promise<RemoteCompanionPollResult> {
  if (remoteCompanionPollInflight) {
    return remoteCompanionPollInflight;
  }

  remoteCompanionPollInflight = pollRemoteCompanionInstallJobsOnce(limit).finally(() => {
    remoteCompanionPollInflight = null;
  });
  return remoteCompanionPollInflight;
}

export async function refreshDownloadQueueForRemotePoll(result: RemoteCompanionPollResult) {
  if (!result.configured || (result.claimed <= 0 && result.started <= 0)) {
    return;
  }

  const queue = await getDownloadQueue();
  useDownloadStore.getState().setItems(queue);
}

export async function runRemoteCompanionAlwaysOnPollOnce() {
  if (!isTauri() || !readRemoteDownloadAlwaysOnConfigured()) {
    return null;
  }

  const result = await runRemoteCompanionInstallJobPollOnce();
  await refreshDownloadQueueForRemotePoll(result);
  return result;
}
