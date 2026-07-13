import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tauri local artwork asset scope", () => {
  it("allows materialized GOG, Ubisoft, and Battle.net artwork files", () => {
    const config = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8")) as {
      app?: {
        security?: {
          assetProtocol?: {
            scope?: { allow?: string[] };
          };
        };
      };
    };

    expect(config.app?.security?.assetProtocol?.scope?.allow).toContain(
      "C:/ProgramData/Ubisoft/Ubisoft Game Launcher/cache/assets/**/*",
    );
    expect(config.app?.security?.assetProtocol?.scope?.allow).toContain(
      "$HOME/AppData/Local/Battle.net/Cache/**/*",
    );
    expect(config.app?.security?.assetProtocol?.scope?.allow).toContain("$APPLOCALDATA/**/*");
  });
});
