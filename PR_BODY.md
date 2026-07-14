# Summary

This worktree aligns the active product surface with the current launcher:

- `/activity` is now the friends activity feed, including RLS-protected
  reactions/comments and Realtime updates; the yearly recap moved to
  `/activity/recap`.
- Store purchases, friend relationships, achievements, play sessions, and
  status posts can produce feed activity through the new migrations.
- `/mods` is reduced to Nexus Mods and Steam Workshop. Nexus uses an official
  no-slug website search handoff; Steam remains a client handoff with local
  read-only Workshop detection. Registered Nexus SSO/native support is optional.
- Legacy mod.io/CurseForge provider search, provider-key staging, provider-ID
  mapping UI, free URL/archive/folder import, and the scraper-based Nexus path
  are removed from the active product surface.
- Platform detection/auth and achievement archive mapping now retain stronger
  provider IDs needed by the current library and activity flows.
- The native shell and splash screen receive the accompanying launcher polish.

## Database changes

- `20260714143000_store_friend_activity_events.sql` adds trusted Store/friend
  activity events.
- `20260714150000_activity_feed_interactions.sql` adds reactions, comments,
  visibility-aware RPCs/RLS, and Realtime publication.
- `20260714160000_mod_provider_rework.sql` activates Nexus and Steam for new
  mod rows while preserving historical provider values.

## Product boundaries

- First-party Cloud Saves remain removed. Provider clients own cloud sync;
  local Cross-Store Save Copy proofs do not upload saves.
- Steam Workshop download/subscription/update state remains Steam-managed.
- Normal Nexus handoff requires no app ID. Optional registered SSO/native
  support still requires provider approval and separate real-provider evidence.
- The five external completion gates remain open until their real redacted
  artifacts exist.

## Verification

Run the checks relevant to the changed surface before merge:

```bash
pnpm --dir launcher format:check
pnpm --dir launcher typecheck
pnpm --dir launcher lint
pnpm --dir launcher test -- src/pages/ActivityPage.test.tsx src/components/friends/ActivityFeed.test.tsx src/pages/ModsPage.test.tsx src/lib/launcher/mods.test.ts
pnpm --dir launcher test -- src/lib/__tests__/activity-feed-interactions-migration-contract.test.ts src/lib/__tests__/store-friend-activity-events-migration-contract.test.ts src/lib/__tests__/mod-provider-rework-migration-contract.test.ts
cargo test --manifest-path launcher/src-tauri/Cargo.toml
pnpm verify:routes
```

Local fixtures and verify routes do not complete hosted, provider, hardware, or
rollout evidence.
