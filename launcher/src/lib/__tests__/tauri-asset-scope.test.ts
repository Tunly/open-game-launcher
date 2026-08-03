import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tauri local artwork asset scope", () => {
  function readAssetScope(): string[] | undefined {
    const config = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8")) as {
      app?: {
        security?: {
          assetProtocol?: {
            scope?: { allow?: string[] };
          };
        };
      };
    };

    return config.app?.security?.assetProtocol?.scope?.allow;
  }

  it("allows materialized launcher and provider artwork files", () => {
    const scope = readAssetScope();

    expect(scope).toContain("$APPLOCALDATA/open-game-launcher/**/*");
    expect(scope).toContain("C:/ProgramData/Ubisoft/Ubisoft Game Launcher/cache/assets/**/*");
    expect(scope).toContain("$HOME/AppData/Local/Battle.net/Cache/**/*");
    expect(scope).toContain("$HOME/.local/share/Steam/appcache/librarycache/**/*");
  });

  it("does not expose broad user data directories to the renderer", () => {
    const scope = readAssetScope();

    expect(scope).not.toContain("$HOME/**/*");
    expect(scope).not.toContain("$APPDATA/**/*");
    expect(scope).not.toContain("$APPLOCALDATA/**/*");
    expect(scope).not.toContain("$APPCACHE/**/*");
  });
});
