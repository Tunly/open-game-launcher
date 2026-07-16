# Hosted Steam Achievement Relay E2E

This operator-only runner verifies the hosted relay's fail-closed boundary. It
is non-mutating by contract: the hosted function has no Steam provider key, no
achievement-ingestion attestation authority, and must not persist achievements
or award hosted XP.

## Preconditions

Deploy `relay-steam-achievements` with `verify_jwt=true` and run the scoped
non-mutating hosted deploy smoke first. The function uses only standard Supabase
authentication/runtime configuration. It must not require `STEAM_WEB_API_KEY`
or `ACHIEVEMENT_INGESTION_ATTESTATION_SECRET`.

Use an authenticated user JWT for the selected Supabase project. The anon key
alone is rejected. Supply a syntactically valid catalog UUID and Steam AppID;
the runner redacts both.

Set these operator-only values through a secure shell/session facility:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_JWT`
- `OGL_STEAM_RELAY_GAME_ID`
- `OGL_STEAM_RELAY_STEAM_APP_ID`

Review the plan:

```bash
pnpm hosted:steam-relay:e2e:plan
```

Run the non-mutating fail-closed probe:

```bash
pnpm hosted:steam-relay:e2e:run
```

The runner sends `{gameId, steamAppId}` and requires exactly HTTP 503 with
`code=steam_login_session_required`, `persistence=local_only`, and
`trust=client_session`. Any hosted-success, provider-verified, attested, or
achievement-count response fails the probe.

Native Steam login-session data remains local to the launcher. Local provider
sync may populate the local achievement cache, but it is not trusted hosted
ingestion and does not award hosted XP.

Successful output contains only the fixed fail-closed contract and `writes=0`.
It never prints API keys, JWTs, SteamIDs/AppIDs, raw response bodies, or catalog
game IDs. A mismatched hosted response reports only its HTTP status and
`response body redacted`.

This output is an operator diagnostic, not external release proof by itself.
