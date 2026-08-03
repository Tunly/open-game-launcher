# Release signing and desktop smoke

Tagged releases are intentionally blocked unless Windows Authenticode signing,
macOS signing/notarization, the Tauri updater signature, and the real desktop
smoke test all succeed.

## Windows Authenticode

Configure these GitHub release-environment values:

- `WINDOWS_CERTIFICATE` secret: base64-encoded code-signing `.pfx`.
- `WINDOWS_CERTIFICATE_PASSWORD` secret: export password for that `.pfx`.
- `WINDOWS_TIMESTAMP_URL` variable: timestamp endpoint supplied by the
  certificate authority.
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets:
  the separate Tauri updater-signing key pair.

The release workflow imports the PFX into the runner's current-user
certificate store, injects its thumbprint into the release-only Tauri config,
and rejects every generated `.exe` whose Authenticode status is not `Valid`.
Never commit the PFX, its password, or the generated signing configuration.

## macOS Developer ID and notarization

Configure these GitHub release-environment secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`.
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`.
- `APPLE_API_KEY`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer ID.
- `APPLE_API_PRIVATE_KEY`: base64-encoded contents of the matching `.p8` key.

The workflow writes the `.p8` only into the runner's temporary directory,
lets the Tauri bundler sign and notarize, then verifies the `.app` with
`codesign` and `spctl` and validates the stapled DMG ticket.

## Desktop E2E smoke

The `desktop-e2e-windows` CI job builds a real debug desktop binary, starts it
through `tauri-driver`, and verifies:

1. the main `OG-Launcher` window renders;
2. header navigation reaches the library;
3. an Add Game dialog traps and restores keyboard focus; and
4. the webview invokes the native `get_system_info` Rust command.

For a local run, install a matching Edge driver plus `tauri-driver`, build the
debug binary, and run:

```powershell
$env:OGL_E2E_APP_BINARY = "src-tauri/target/x86_64-pc-windows-msvc/debug/open-game-launcher.exe"
pnpm --dir launcher test:e2e:desktop
```

The external completion evidence remains separate: hosted Supabase/Stripe
smokes, hardware/OS evidence, and rollout receipts must still be collected on
the release environment with `pnpm completion:gate:external`.
