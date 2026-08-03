# Summary

This worktree aligns the active product surface with the current launcher:

- `/activity` is now the friends activity feed, including RLS-protected
  reactions/comments and Realtime updates; the yearly recap moved to
  `/activity/recap`.
- Store purchases, friend relationships, achievements, play sessions, and
  status posts can produce feed activity through the new migrations.
- The Mods product surface was removed entirely: Nexus Mods website handoff,
  Steam Workshop integration, mod browsing, managed mods, the mod install
  queue, NXM link handling, and client-manager mod roots are gone from UI,
  native commands, types, and documentation.
- Platform detection/auth and achievement archive mapping now retain stronger
  provider IDs needed by the current library and activity flows.
- The native shell and splash screen receive the accompanying launcher polish.

## Database changes

- `20260714143000_store_friend_activity_events.sql` adds trusted Store/friend
  activity events.
- `20260714150000_activity_feed_interactions.sql` adds reactions, comments,
  visibility-aware RPCs/RLS, and Realtime publication.
- `20260802120000_remove_mod_support.sql` retires all mod tables after
  preflighting that no mod data or unknown dependants remain.

## Product boundaries

- First-party Cloud Saves remain removed. Provider clients own cloud sync;
  local Cross-Store Save Copy proofs do not upload saves.
- Mod browsing, installation, and provider handoffs are no longer part of the
  product. Steam catalog and subscription state remains Steam-managed.
- The five external completion gates remain open until their real redacted
  artifacts exist.

## Verification

Run the checks relevant to the changed surface before merge:

```bash
pnpm --dir launcher format:check
pnpm --dir launcher typecheck
pnpm --dir launcher lint
pnpm --dir launcher test -- src/pages/ActivityPage.test.tsx src/components/friends/ActivityFeed.test.tsx
pnpm --dir launcher test -- src/lib/__tests__/activity-feed-interactions-migration-contract.test.ts src/lib/__tests__/store-friend-activity-events-migration-contract.test.ts src/lib/__tests__/feature-removal-migrations-contract.test.ts
cargo test --manifest-path launcher/src-tauri/Cargo.toml
pnpm verify:routes
```

Local fixtures and verify routes do not complete hosted, provider, hardware, or
rollout evidence.
