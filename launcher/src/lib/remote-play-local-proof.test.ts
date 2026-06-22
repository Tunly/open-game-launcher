import { describe, expect, it } from "vitest";

import { createRemotePlayLocalProofRows } from "./remote-play-local-proof";

describe("remote play local proof", () => {
  it("covers Steam, Epic/EOS, HTTPS cloud, and unsafe URI review lanes", () => {
    const rows = createRemotePlayLocalProofRows();

    expect(rows.map((row) => row.id)).toEqual([
      "steam-appid",
      "epic-eos-uri",
      "https-cloud",
      "unsafe-uri",
    ]);
    expect(rows.find((row) => row.id === "epic-eos-uri")).toMatchObject({
      label: "Epic/EOS URI",
      status: "REVIEW",
      tone: "review",
    });
    expect(rows.find((row) => row.id === "unsafe-uri")).toMatchObject({
      status: "BLOCKED",
      tone: "blocked",
    });
  });

  it("keeps local proof copy free of live provider or streaming success claims", () => {
    const proofText = createRemotePlayLocalProofRows()
      .map((row) => `${row.label} ${row.status} ${row.detail}`)
      .join(" ");

    expect(proofText).toContain("no provider session");
    expect(proofText).toContain("does not claim live streaming success");
    expect(proofText).not.toMatch(
      /token=|signed url|provider session active|live streaming verified/i,
    );
  });
});
