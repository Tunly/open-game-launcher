# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a vulnerability

**Please do not file a public issue.** Open Game Launcher takes security seriously. To report a vulnerability, contact the maintainers privately:

- Email: security@open-game-launcher.example
- GPG: `0xDEADBEEF 1234 5678 9ABC DEF0 1234 5678 9ABC DEF0` (placeholder; replace before publishing)

Include as much of the following as you can:

1. A clear description of the issue and the impact (RCE? RLS bypass? token theft?).
2. Reproduction steps or a minimal proof-of-concept.
3. Affected commit / version.
4. Your name / handle for the credit line (or "anonymous").

We aim to acknowledge new reports within **3 business days** and ship a fix or mitigation within **30 days** for high-severity issues, longer for low-severity reports coordinated with the reporter.

## Hardening scope (in progress)

See `ROADMAP.md` → **Phase 1 — Security & RLS Hardening** for the current backlog:

- Stripe checkout: enforce caller JWT, derive `user_id` from claims, correct column.
- RLS: add missing `SELECT` on `price_history`, write policies on `store_orders` / `store_order_items` / `store_builds` / `store_licenses`, block self-publish in `store_products`.
- Rust: eliminate shell / PowerShell / path-traversal injection vectors, replace plaintext-token JSON fallback with OS keychain, swap `Mutex::lock().unwrap()` for poisoned-lock-aware variants.

## Best practices for contributors

- **Never** commit secrets (`.env`, signing keys, tokens) — `.gitignore` covers `.env*`.
- **Never** accept user-controlled paths without normalization and a "stays inside the configured root" check.
- **Always** use parameterised SQL — never string-concatenate values into a query.
- **Always** read privileged input from JWT claims, never from the request body.
- Run `pnpm typecheck && pnpm lint && pnpm test` before opening a PR.

## Recognition

We credit security researchers in the release notes (unless you prefer to remain anonymous). Thank you for helping keep Open Game Launcher safe.
