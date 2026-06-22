import { describe, expect, it } from "vitest";

import { buildClientPathOverlayPreflight } from "../client-path-overlay-preflight";
import type { ClientPathOverlay } from "../types";

function overlay(input: Partial<ClientPathOverlay> = {}): ClientPathOverlay {
  return {
    enabled: input.enabled ?? true,
    id: input.id ?? "overlay-1",
    label: input.label ?? "Assets",
    notes: input.notes ?? "",
    readOnly: input.readOnly ?? true,
    sourcePath: input.sourcePath ?? "/safe/cache/assets",
    targetPath: input.targetPath ?? "/games/demo/assets",
  };
}

describe("client path overlay preflight", () => {
  it("returns an empty preflight when no enabled overlays exist", () => {
    const preflight = buildClientPathOverlayPreflight({
      pathOverlays: [overlay({ enabled: false })],
    });

    expect(preflight.status).toBe("empty");
    expect(preflight.canApply).toBe(false);
    expect(preflight.enabledCount).toBe(0);
    expect(preflight.disabledCount).toBe(1);
  });

  it("marks read-only overlays with source and target paths as ready", () => {
    const preflight = buildClientPathOverlayPreflight({ pathOverlays: [overlay()] });

    expect(preflight.status).toBe("ready");
    expect(preflight.canApply).toBe(true);
    expect(preflight.readOnlyCount).toBe(1);
    expect(preflight.entries[0]?.checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
    ]);
  });

  it("warns for writable overlays that require manual review", () => {
    const preflight = buildClientPathOverlayPreflight({
      pathOverlays: [overlay({ readOnly: false })],
    });

    expect(preflight.status).toBe("warning");
    expect(preflight.canApply).toBe(true);
    expect(preflight.writableCount).toBe(1);
    expect(preflight.entries[0]?.checks.at(-1)).toMatchObject({
      label: "Write policy",
      status: "warning",
    });
  });

  it("blocks missing paths, root-like paths, same-path pairs, and duplicate targets", () => {
    const preflight = buildClientPathOverlayPreflight({
      pathOverlays: [
        overlay({ id: "missing-source", sourcePath: "" }),
        overlay({ id: "root-source", sourcePath: "/" }),
        overlay({ id: "drive-root", targetPath: "C:\\" }),
        overlay({
          id: "same-path",
          sourcePath: "/games/demo/assets",
          targetPath: "/games/demo/assets/",
        }),
        overlay({ id: "duplicate-a", targetPath: "/games/demo/shared" }),
        overlay({ id: "duplicate-b", targetPath: "/games/demo/shared/" }),
      ],
    });

    expect(preflight.status).toBe("blocked");
    expect(preflight.canApply).toBe(false);
    expect(preflight.blockedCount).toBe(6);
    expect(
      preflight.entries
        .find((entry) => entry.id === "duplicate-a")
        ?.checks.some((check) => check.label === "Target conflict" && check.status === "blocked"),
    ).toBe(true);
  });
});
