import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const first = "remote";
const second = "play";
const removedFeaturePattern = new RegExp(
  `${first}[\\s_-]*${second}|${first}${second}`,
  "i",
);

test("removed launcher feature leaves no tracked repo traces", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);

  const offenders = files.filter((file) => {
    if (!existsSync(file)) {
      return false;
    }

    if (removedFeaturePattern.test(file)) {
      return true;
    }

    const contents = readFileSync(file, "utf8");
    return removedFeaturePattern.test(contents);
  });

  assert.deepEqual(offenders, []);
});
