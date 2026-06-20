import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueRemoteCompanionInstallJob: vi.fn(),
}));

vi.mock("../lib/supabase/remote-companion", () => ({
  enqueueRemoteCompanionInstallJob: mocks.enqueueRemoteCompanionInstallJob,
}));

import { RemoteInstallDashboardPage } from "./RemoteInstallDashboardPage";

let root: Root | null = null;
const companionDeviceId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  mocks.enqueueRemoteCompanionInstallJob.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

async function waitForAssertion(assertion: () => void) {
  const timeoutAt = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe("RemoteInstallDashboardPage", () => {
  it("builds an encoded oglauncher install handoff from web params", async () => {
    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          "/downloads/remote?gameId=demo-remote&title=Remote Demo&downloadUrl=https://cdn.og-launcher.test/demo build.zip&downloadSha256=abc 123&installManifestUrl=https://cdn.og-launcher.test/demo manifest.json&installManifestSha256=manifest 123",
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Remote Install Web Dashboard");
    });

    const expected =
      "oglauncher://install?gameId=demo-remote&title=Remote+Demo&downloadUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fdemo+build.zip&downloadSha256=abc+123&installManifestUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fdemo+manifest.json&installManifestSha256=manifest+123&source=web-dashboard";
    expect(container).toHaveTextContent(expected);
    expect(container).toHaveTextContent("Local Only");
    expect(container).toHaveTextContent("Remote Companion Cloud");
    expect(container).toHaveTextContent("Hosted Deploy still needs verification.");
    expect(
      container.querySelector<HTMLAnchorElement>('a[href^="oglauncher://install"]')?.href,
    ).toBe(expected);
  });

  it("blocks unsafe web payloads before creating a desktop link", async () => {
    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={["/downloads/remote?gameId=demo-remote&downloadUrl=javascript:alert(1)"]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Blocked");
    });

    expect(container).toHaveTextContent(
      "Remote install handoff rejected a non-HTTP(S) download URL.",
    );
    expect(container).toHaveTextContent("Remote Companion Cloud");
    expect(container).toHaveTextContent("Local Only");
    expect(container.querySelector('a[href^="oglauncher://install"]')).toBeNull();
  });

  it("copies the generated install link when clipboard is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const container = renderWithRoot(
      <MemoryRouter initialEntries={["/downloads/remote?gameId=steam-440&title=Team Fortress 2"]}>
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Ready");
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /copy deep link/i.test(candidate.textContent ?? ""),
    );
    if (!button) throw new Error("Copy button not found");
    await act(async () => {
      button.click();
    });

    await waitForAssertion(() => {
      expect(writeText).toHaveBeenCalledWith(
        "oglauncher://install?gameId=steam-440&title=Team+Fortress+2&source=web-dashboard",
      );
      expect(container).toHaveTextContent("Copied");
    });
  });

  it("enqueues an opaque hosted relay job without raw download URLs", async () => {
    vi.stubEnv("VITE_OG_REMOTE_HOSTED_RELAY_ENABLED", "true");
    mocks.enqueueRemoteCompanionInstallJob.mockResolvedValue({
      expiresAt: "2026-06-11T12:30:00.000Z",
      jobId: "job-1",
      status: "pending",
    });

    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          `/downloads/remote?gameId=remote-demo&title=Remote Demo&downloadUrl=https://cdn.og-launcher.test/demo.zip&companionDeviceId=${companionDeviceId}&productId=${productId}&buildId=${buildId}&platform=windows&channel=stable`,
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Hosted Relay");
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /send via hosted relay/i.test(candidate.textContent ?? ""),
    );
    if (!button) throw new Error("Hosted relay button not found");

    await act(async () => {
      button.click();
    });

    await waitForAssertion(() => {
      expect(mocks.enqueueRemoteCompanionInstallJob).toHaveBeenCalledWith({
        buildId,
        companionDeviceId,
        gameId: "remote-demo",
        packageRef: {
          channel: "stable",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        platform: "windows",
        productId,
        source: "web-dashboard",
        title: "Remote Demo",
      });
      expect(container).toHaveTextContent("Job Queued");
      expect(container).toHaveTextContent("job-1");
    });

    expect(JSON.stringify(mocks.enqueueRemoteCompanionInstallJob.mock.calls[0][0])).not.toMatch(
      /https?:\/\//i,
    );
    expect(JSON.stringify(mocks.enqueueRemoteCompanionInstallJob.mock.calls[0][0])).not.toMatch(
      /oglauncher:\/\/|token=|sig=|downloadUrl|installManifestUrl|signedUrl/i,
    );
  });

  it("enqueues hosted relay jobs on normal route when deployment flag is enabled", async () => {
    vi.stubEnv("VITE_OG_REMOTE_HOSTED_RELAY_ENABLED", "true");
    mocks.enqueueRemoteCompanionInstallJob.mockResolvedValue({
      expiresAt: "2026-06-11T12:30:00.000Z",
      jobId: "job-normal-1",
      status: "pending",
    });

    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          `/downloads/remote?gameId=remote-demo&title=Remote Demo&downloadUrl=https://cdn.og-launcher.test/demo.zip&companionDeviceId=${companionDeviceId}&productId=${productId}&buildId=${buildId}&platform=windows&channel=stable`,
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Hosted contract is locally verified.");
      expect(container).toHaveTextContent("Ready");
      expect(container).toHaveTextContent("Store Ticket Jobs");
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /send via hosted relay/i.test(candidate.textContent ?? ""),
    );
    if (!button) throw new Error("Hosted relay button not found");

    await act(async () => {
      button.click();
    });

    await waitForAssertion(() => {
      expect(mocks.enqueueRemoteCompanionInstallJob).toHaveBeenCalledWith({
        buildId,
        companionDeviceId,
        gameId: "remote-demo",
        packageRef: {
          channel: "stable",
          delivery: "store-build-ticket",
          downloadTicketRequired: true,
        },
        platform: "windows",
        productId,
        source: "web-dashboard",
        title: "Remote Demo",
      });
      expect(container).toHaveTextContent("Job Queued");
      expect(container).toHaveTextContent("job-normal-1");
    });
  });

  it("blocks hosted relay enqueue when hosted deployment is still local-only", async () => {
    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          `/downloads/remote?gameId=remote-demo&title=Remote Demo&companionDeviceId=${companionDeviceId}&productId=${productId}`,
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent(
        "Hosted relay deployment flag must be enabled before enqueue.",
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /send via hosted relay/i.test(candidate.textContent ?? ""),
    );
    expect(button).toBeDisabled();
    expect(mocks.enqueueRemoteCompanionInstallJob).not.toHaveBeenCalled();
  });

  it("does not let verify mode bypass the hosted relay enqueue env gate", async () => {
    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          `/downloads/remote?gameId=remote-demo&title=Remote Demo&companionDeviceId=${companionDeviceId}&productId=${productId}&verify=remote-hosted-contract-ready`,
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Hosted contract is locally verified.");
      expect(container).toHaveTextContent(
        "Hosted relay deployment flag must be enabled before enqueue.",
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /send via hosted relay/i.test(candidate.textContent ?? ""),
    );
    expect(button).toBeDisabled();
    expect(mocks.enqueueRemoteCompanionInstallJob).not.toHaveBeenCalled();
  });

  it("blocks hosted relay enqueue until a store product UUID is present", async () => {
    vi.stubEnv("VITE_OG_REMOTE_HOSTED_RELAY_ENABLED", "true");
    const container = renderWithRoot(
      <MemoryRouter
        initialEntries={[
          `/downloads/remote?gameId=remote-demo&title=Remote Demo&companionDeviceId=${companionDeviceId}`,
        ]}
      >
        <Routes>
          <Route element={<RemoteInstallDashboardPage />} path="/downloads/remote" />
        </Routes>
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Hosted relay requires a store product id.");
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      /send via hosted relay/i.test(candidate.textContent ?? ""),
    );
    expect(button).toBeDisabled();
    expect(mocks.enqueueRemoteCompanionInstallJob).not.toHaveBeenCalled();
  });
});
