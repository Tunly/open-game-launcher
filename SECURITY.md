# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a vulnerability

**Please do not file a public issue.** Open Game Launcher takes security seriously. To report a vulnerability, use the repository's private vulnerability reporting channel when it is available. If this repository is mirrored or deployed privately, the deployment owner must publish a real security contact before accepting external reports.

Include as much of the following as you can:

1. A clear description of the issue and the impact (RCE? RLS bypass? token theft?).
2. Reproduction steps or a minimal proof-of-concept.
3. Affected commit / version.
4. Your name / handle for the credit line (or "anonymous").

We aim to acknowledge new reports within **3 business days** and ship a fix or mitigation within **30 days** for high-severity issues, longer for low-severity reports coordinated with the reporter.

## Hardening scope

Security & RLS Hardening has been successfully completed:

- **Stripe checkout**: Enforced caller JWT, derived `user_id` from claims, and corrected the target column.
- **RLS**: Added missing `SELECT` policy on `price_history`, implemented access policies on `store_orders`, `store_order_items`, `store_builds`, and `store_licenses`, and blocked self-publishing in `store_products`.
- **Rust backend**: Eliminated shell, PowerShell, and path-traversal injection vectors, replaced plaintext-token JSON fallback with the OS keychain, and swapped `Mutex::lock().unwrap()` for poisoned-lock-aware variants to prevent lock poisoning.
- **Platform auth**: GOG and EA bearer tokens stay in the native secure store; frontend flows remove legacy browser token copies, and Epic keeps only a non-sensitive connected-session marker while Legendary owns credentials.
- **Install manifests**: Signed OG install manifests verify with a public key; `OGL_INSTALL_MANIFEST_SIGNING_KEY` is a release/staging secret and must never be committed or bundled into public client builds.

## Best practices for contributors

- **Never** commit secrets (`.env`, signing keys, tokens) — `.gitignore` covers `.env*`.
- **Never** accept user-controlled paths without normalization and a "stays inside the configured root" check.
- **Always** use parameterised SQL — never string-concatenate values into a query.
- **Always** read privileged input from JWT claims, never from the request body.
- Run `pnpm typecheck && pnpm lint && pnpm test` before opening a PR.

## Recognition

We credit security researchers in the release notes (unless you prefer to remain anonymous). Thank you for helping keep Open Game Launcher safe.
