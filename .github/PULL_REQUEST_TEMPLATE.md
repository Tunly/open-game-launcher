## What does this PR do?

<!-- Describe the change clearly. What problem does it solve? Why is this approach the right one? -->



## Related Issue

<!-- Link the issue this PR addresses. If no issue exists, consider creating one first. -->

Fixes #

## Type of Change

<!-- Check the one that applies. -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 🔒 Security fix
- [ ] 📝 Documentation update
- [ ] ✅ Tests (adding or improving test coverage)
- [ ] ♻️ Refactor (no behavior change)

## Changes Made

<!-- List the specific changes. Include file paths for code changes. -->

-

## Database / Edge Function Changes

<!-- Only if this PR touches supabase/migrations or supabase/functions. List the migration/function names. -->

-

## Product Boundaries

<!-- Check the ones that apply. This project keeps several surfaces deliberately out of scope. -->

- [ ] No new first-party cloud-save or launcher-owned save archive surface — or N/A
- [ ] No mod install/browse surface (Mods were removed) — or N/A
- [ ] No OG Store commerce (cart, checkout, licenses, refunds) — or N/A
- [ ] No game-process injection / anti-cheat bypass / fake game-FPS claims — or N/A
- [ ] Local fixtures and `?verify=...` routes are not presented as hosted, provider, hardware, or rollout evidence — or N/A

## How to Test

<!-- Steps to verify this change works. For bugs: reproduction steps + proof that the fix works. -->

1.
2.
3.

## Checklist

<!-- Complete these before requesting review. -->

### Code

- [ ] I've read the [Contributing Guide](https://github.com/NousResearch/open-game-launcher/blob/main/CONTRIBUTING.md)
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix(scope):`, `feat(scope):`, etc.) and are signed off (`git commit -s`, DCO)
- [ ] I searched for [existing PRs](https://github.com/NousResearch/open-game-launcher/pulls) to make sure this isn't a duplicate
- [ ] My PR contains **only** changes related to this fix/feature (no unrelated commits)
- [ ] UI changes follow the **Retro Manga Launcher** system in [docs/PROJECT_DESIGN.md](https://github.com/NousResearch/open-game-launcher/blob/main/docs/PROJECT_DESIGN.md) — or N/A
- [ ] I've run the relevant checks and they pass: `pnpm --dir launcher format:check`, `pnpm --dir launcher typecheck`, `pnpm --dir launcher lint`
- [ ] I've run the relevant tests: `pnpm --dir launcher test`, `cargo test --manifest-path launcher/src-tauri/Cargo.toml` — or N/A
- [ ] I've run `pnpm verify:routes` when routes, verify flags, or the visual manifest changed — or N/A
- [ ] I've run `pnpm completion:gate:local` before handoff — or N/A
- [ ] I've tested on my platform: <!-- e.g. Arch Linux, Ubuntu 24.04, Windows 11 -->

### Documentation & Housekeeping

<!-- Check all that apply. It's OK to check "N/A" if a category doesn't apply to your change. -->

- [ ] I've updated relevant documentation (README, `docs/`, FEATURE_PLAN.md, CHANGELOG.md) — or N/A
- [ ] I've updated `supabase/migrations` or Edge Functions with contract tests when schema/RLS/function behavior changed — or N/A
- [ ] I've considered the external evidence gates (hosted cron, provider-live, hardware/OS, rollout) when claiming completion — or N/A

## Screenshots / Logs

<!-- If applicable, add screenshots or log output showing the fix/feature in action. The Retro Manga style matters — show the actual rendered UI for visual changes. -->
