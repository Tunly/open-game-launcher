-- Allow authenticated users to promote native-provider game-id mappings that
-- were proven by a live provider API search, without granting trusted
-- verified_at writes.

drop policy if exists mod_provider_game_mappings_insert_own on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_insert_own
  on public.mod_provider_game_mappings for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'active'
    and source in ('manual', 'local_hint', 'provider_api')
    and confidence in ('manual', 'low', 'medium', 'high')
    and verified_at is null
  );

drop policy if exists mod_provider_game_mappings_update_own_unverified on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_update_own_unverified
  on public.mod_provider_game_mappings for update
  to authenticated
  using (created_by = (select auth.uid()) and verified_at is null)
  with check (
    created_by = (select auth.uid())
    and source in ('manual', 'local_hint', 'provider_api')
    and confidence in ('manual', 'low', 'medium', 'high')
    and verified_at is null
  );
