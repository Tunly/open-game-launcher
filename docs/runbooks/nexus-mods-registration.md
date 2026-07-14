# Nexus Mods application registration

Normal OG-Launcher releases need no Nexus application slug: they hand the
selected game and search to the official Nexus Mods website. This runbook is
only for the optional native API, browser SSO and NXM continuation enhancement.
There is no HTML scraping or renderer-facing API-key input in either mode.

## Registration

1. Contact Nexus Mods support with a testing build and the requested public-app
   metadata, following the
   [Nexus Mods API AUP](https://help.nexusmods.com/article/114-api-acceptable-use-policy).
2. Receive the public application slug used by the Nexus SSO flow.
3. Set `NEXUS_MODS_APP_ID` only in the optional registered build environment
   before compiling the Tauri application. The value is public application
   metadata and is embedded in that binary; it is not a user credential.
4. Build and sign the optional native-integration variant. A runtime value with
   the same name is accepted only as a development override. On macOS/Linux,
   merge `src-tauri/tauri.nexus.conf.json` into this variant so only that build
   registers `nxm`; the normal release intentionally bundles only
   `oglauncher://`.

Never place a personal API key, an SSO-issued user key, an NXM key, an NXM URL or
a download URL in build variables. SSO-issued user keys are written directly to
the operating-system keychain. Short-lived NXM values remain in backend memory.

## Registration request package

Use the following metadata when contacting `support@nexusmods.com`:

- **Application name:** OG-Launcher / Open Game Launcher
- **Requested application slug:** `og-launcher` (Nexus Mods assigns the final
  value)
- **Source:** <https://github.com/Tunly/open-game-launcher>
- **License:** AGPL-3.0-only
- **Logo:** `launcher/src-tauri/icons/icon.png`; it has a dark background and is
  suitable for the Nexus application list
- **Purpose:** Desktop game launcher with a simple Nexus Mods browser, official
  browser SSO, Premium/direct native ZIP/7z installation and Free-user NXM
  continuation
- **Credential handling:** User keys are stored only in the operating-system
  keychain. NXM download keys stay in backend memory and are removed from logs,
  manifests, queue state, errors and Supabase
- **Network policy:** Official Nexus API only, bounded responses, CDN allowlist,
  MIME/size checks, no HTML scraping and no server-side API-key storage
- **Fallback policy:** Unsupported archives and ambiguous targets open the exact
  official Nexus page and never modify the game directory

Suggested request text:

> Hello Nexus Mods Support,
>
> we would like to register OG-Launcher as a public open-source Nexus Mods
> application. The source is available at
> https://github.com/Tunly/open-game-launcher under AGPL-3.0-only. The launcher
> uses the official browser SSO flow and API; it does not scrape Nexus Mods or
> ask end users to paste API keys. User credentials stay in the operating-system
> keychain, and short-lived NXM values are never persisted or sent to our
> backend.
>
> The attached testing build demonstrates game mapping, Popular/Latest cards,
> Premium/direct native installation, Free-user NXM continuation and safe
> provider handoff for unsupported files. Could you review the integration and
> issue the public application slug? Our requested slug is `og-launcher`.

Before sending, replace “attached testing build” with the exact signed artifact
name and add the requester’s support contact. Sending the request is an external
representational action and must be performed or explicitly approved by the
project owner.

## Live acceptance

- Launch the normal packaged build without `NEXUS_MODS_APP_ID` and verify that
  `Browse on Nexus` opens an official search containing the selected game and
  query, without claiming installation or registering OG as the NXM handler.
- For the optional registered variant, launch the packaged build with the slug
  embedded at compile time and verify that `Connect Nexus` is available.
- Complete browser authorization with a real Nexus account and verify that no
  key is rendered or logged.
- Browse both Popular and Latest for a uniquely mapped installed game.
- Verify a Premium/direct download reaches the native queue and a Free-user
  download opens the exact Nexus file page before continuing through `nxm://`.
- Cancel SSO, revoke access, exercise a rate limit, and confirm the UI reports a
  reconnect/error state without exposing response credentials.
- Confirm a browser handoff is never reported as an installed mod.

Native live cards are complete only after these checks pass with the registered
application. The no-slug handoff remains the normal supported fallback, with no
scraping or mock-data catalog.
