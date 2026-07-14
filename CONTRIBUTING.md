# Contributing

Thanks for your interest in contributing to Open Game Launcher! This project is licensed under AGPL-3.0 and welcomes community contributions.

## Quick start

```bash
node --version   # >= 22.12 and < 26
pnpm --version   # >= 9
rustup target add x86_64-pc-windows-msvc aarch64-apple-darwin x86_64-unknown-linux-gnu

pnpm --dir launcher install
cp supabase/functions/.env.example supabase/functions/.env  # fill in keys
pnpm --dir launcher typecheck
pnpm --dir launcher lint
pnpm --dir launcher test

pnpm --dir launcher tauri dev
```

## Workflow

1. **Fork** the repository and create a feature branch from `main`:
   - `feature/<short-slug>` for new features
   - `fix/<short-slug>` for bug fixes
   - `chore/<short-slug>` for tooling / refactors
2. Run `pnpm --dir launcher typecheck && pnpm --dir launcher lint && pnpm --dir launcher test` before opening a PR.
3. Sign off each commit (`git commit -s`) — see the DCO requirement below.
4. Open a PR with a clear description and link any related issues.

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Examples:

- `feat(overlay): add smart-join CTA to friend list`
- `fix(rust): prevent shell injection in family::copy_invite`
- `chore(tooling): add Prettier + Husky`
- `test(stores): cover modInstallStore terminal states`
- `docs(roadmap): mark phase N as completed`

Subject line ≤ 72 chars, body wraps at 100. Use the body to explain **why**, not what.

## DCO (Developer Certificate of Origin)

This project uses the [Developer Certificate of Origin
(DCO)](https://developercertificate.org/). A `Signed-off-by:` line certifies
the statements in the DCO, including that you have the right to submit the
contribution under the project's license. It is not a copyright assignment.
Add the sign-off with `git commit -s`; use your real name and an email address
you are authorized to associate with the contribution.

## Code style

- TypeScript: strict, follow the existing import order (alphabetical within group), prefer named exports.
- React: function components, hooks at the top of the file, no inline components in render.
- Rust: edition 2021, follow `cargo fmt` + `cargo clippy -- -D warnings`.
- SQL: lower-case keywords, two-space indent, one statement per line.
- Use the existing CSS / Tailwind tokens; do not introduce a new design system.

## Project conventions

- See `AGENTS.md` for the **Retro Manga Launcher** visual system rules.
- See `FEATURE_PLAN.md` for the backlog of missing features and implementation progress.
- See `docs/PROJECT_DESIGN.md` for the canonical design language.

## Reporting issues

Open a normal GitHub issue with a clear title, reproduction or proposal,
affected platform, and relevant logs. This repository currently has no issue
templates, so no template filename is required. For security issues, **do
not** open a public issue — follow `SECURITY.md` instead.

Contributions are licensed under AGPL-3.0.
