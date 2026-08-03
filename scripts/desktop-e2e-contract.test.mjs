import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktopSmoke = readFileSync(
  new URL("../launcher/e2e/desktop-smoke.test.mjs", import.meta.url),
  "utf8",
);

test("desktop smoke drives the real launcher binary", () => {
  assert.match(desktopSmoke, /OGL_E2E_APP_BINARY/);
  assert.match(desktopSmoke, /tauri-driver/);
  assert.match(desktopSmoke, /setBrowserName\("wry"\)/);
  assert.match(desktopSmoke, /tauri:options/);
});

test("desktop smoke covers navigation and modal focus", () => {
  assert.match(desktopSmoke, /a\[href=\"\/library\"\]/);
  assert.match(desktopSmoke, /button\[aria-label=\"Add a Game\"\]/);
  assert.match(desktopSmoke, /document\.activeElement/);
  assert.match(desktopSmoke, /Key\.ESCAPE/);
  assert.match(desktopSmoke, /focusReturnedToTrigger/);
});

test("desktop smoke crosses the frontend to Rust IPC boundary", () => {
  assert.match(
    desktopSmoke,
    /__TAURI_INTERNALS__\.invoke\("get_system_info"\)/,
  );
  assert.match(desktopSmoke, /systemInfo\.value\?\.os/);
});
