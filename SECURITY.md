# Security Policy

## Supported versions

Open Game Launcher is currently an unreleased pre-release project. There is no
published version with a security-support guarantee. Reports against the
current `main` branch are welcome and will be handled on a best-effort basis;
forks, mirrors, private deployments, and old commits are maintained by their
respective owners.

## Reporting a vulnerability

**Please do not file a public issue.** Open Game Launcher takes security seriously. To report a vulnerability, use the repository's private vulnerability reporting channel when it is available. If this repository is mirrored or deployed privately, the deployment owner must publish a real security contact before accepting external reports.

Include as much of the following as you can:

1. A clear description of the issue and the impact (RCE? RLS bypass? token theft?).
2. Reproduction steps or a minimal proof-of-concept.
3. Affected commit / version.
4. Your name / handle for the credit line (or "anonymous").

We aim to acknowledge new reports within **3 business days**. Remediation time
depends on severity, reproducibility, maintainer availability, and coordinated
disclosure; this target is not an SLA or a promise that an unreleased build is
production-ready.

## Hardening scope

The checkout contains the following local hardening. Hosted, provider, and
hardware proof still follows the external completion gates:

- **Stripe checkout**: Enforced caller JWT, derived `user_id` from claims, and corrected the target column.
- **RLS**: Implemented access policies on `store_orders`, `store_order_items`, `store_builds`, and `store_licenses`, and blocked self-publishing in `store_products`.
- **Rust backend**: Eliminated shell, PowerShell, and path-traversal injection vectors, replaced plaintext-token JSON fallback with the OS keychain, and swapped `Mutex::lock().unwrap()` for poisoned-lock-aware variants to prevent lock poisoning.
- **Platform auth**: GOG and EA bearer tokens stay in the native secure store; frontend flows remove legacy browser token copies, and Epic keeps only a non-sensitive connected-session marker while Legendary owns credentials.
- **Install manifests**: Signed OG install manifests verify with a public key; `OGL_INSTALL_MANIFEST_SIGNING_KEY` is a release/staging secret and must never be committed or bundled into public client builds.
- **Atomic social/data mutations**: Direct-message and group-room creation,
  trusted playtime aggregation, price-drop delivery, social-link replacement,
  achievement ingestion cursors, invite-status changes, and submitted artwork
  identity are constrained through narrow RPCs, RLS, and migration-level guards.
- **Activity interactions**: Feed visibility is checked server-side for reads
  and writes; reactions/comments use owner-bound RPCs and RLS, with deletion
  restricted to the author or owning activity where applicable.

## Best practices for contributors

- **Never** commit secrets (`.env`, signing keys, tokens) — `.gitignore` covers `.env*`.
- **Never** accept user-controlled paths without normalization and a "stays inside the configured root" check.
- **Always** use parameterised SQL — never string-concatenate values into a query.
- **Always** read privileged input from JWT claims, never from the request body.
- Run `pnpm --dir launcher typecheck`, `pnpm --dir launcher lint`, and
  `pnpm --dir launcher test` before opening a PR.

Security researchers are credited in release notes unless they request
anonymity.
