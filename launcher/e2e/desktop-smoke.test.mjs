import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

import { Builder, By, Capabilities, Key, until } from "selenium-webdriver";

const driverHost = process.env.OGL_E2E_DRIVER_HOST ?? "127.0.0.1";
const driverPort = Number.parseInt(process.env.OGL_E2E_DRIVER_PORT ?? "4444", 10);
const application = process.env.OGL_E2E_APP_BINARY;
const driverBinary = process.env.TAURI_DRIVER_BIN ?? "tauri-driver";

if (!application) {
  throw new Error("OGL_E2E_APP_BINARY must point to the built OG Launcher desktop executable.");
}

let session;
let tauriDriver;

function waitForPort(host, port, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function probe() {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(
            new Error(`tauri-driver did not listen on ${host}:${port} within ${timeoutMs}ms.`),
          );
          return;
        }
        setTimeout(probe, 250);
      });
    }

    probe();
  });
}

before(async () => {
  tauriDriver = spawn(driverBinary, [], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  tauriDriver.once("error", (error) => {
    throw error;
  });

  await waitForPort(driverHost, driverPort);

  const capabilities = new Capabilities();
  capabilities.setBrowserName("wry");
  capabilities.set("tauri:options", { application: path.resolve(application) });

  // WebView2 on CI runners can be slow to spin up its DevTools pipe. The
  // first session creation occasionally fails with "DevToolsActivePort file
  // doesn't exist"; retrying after the process settles fixes it.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      session = await new Builder()
        .usingServer(`http://${driverHost}:${driverPort}/`)
        .withCapabilities(capabilities)
        .build();
      break;
    } catch (error) {
      lastError = error;
      await session?.quit().catch(() => undefined);
      session = undefined;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
  if (!session) {
    throw lastError;
  }
  await session.manage().setTimeouts({ implicit: 500, pageLoad: 30_000, script: 20_000 });
});

after(async () => {
  await session?.quit().catch(() => undefined);
  tauriDriver?.kill();
});

test("main window navigates, traps dialog focus, and crosses the IPC boundary", async () => {
  const brand = await session.wait(
    until.elementLocated(By.xpath("//*[self::button or self::a][contains(., 'OG-Launcher')]")),
    30_000,
  );
  assert.equal(await brand.isDisplayed(), true);

  const libraryLink = await session.findElement(By.css('a[href="/library"]'));
  await libraryLink.click();
  await session.wait(until.urlContains("/library"), 15_000);

  const addGameButton = await session.wait(
    until.elementLocated(By.css('button[aria-label="Add a Game"]')),
    15_000,
  );
  await addGameButton.click();

  const dialog = await session.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000);
  const focusIsInsideDialog = await session.executeScript(
    "return Boolean(document.querySelector('[role=dialog]')?.contains(document.activeElement));",
  );
  assert.equal(focusIsInsideDialog, true);

  await session.actions().sendKeys(Key.ESCAPE).perform();
  await session.wait(until.stalenessOf(dialog), 10_000);
  const focusReturnedToTrigger = await session.executeScript(
    "return document.activeElement?.getAttribute('aria-label') === 'Add a Game';",
  );
  assert.equal(focusReturnedToTrigger, true);

  const systemInfo = await session.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    window.__TAURI_INTERNALS__.invoke("get_system_info")
      .then((value) => done({ ok: true, value }))
      .catch((error) => done({ ok: false, error: String(error) }));
  `);
  assert.equal(systemInfo.ok, true, systemInfo.error);
  assert.equal(typeof systemInfo.value?.os, "string");
  assert.ok(systemInfo.value.os.length > 0);
});
