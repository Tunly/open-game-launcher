-- Rows captured by the earlier corrective audit are ambiguous: an exact
-- joined_at/created_at match is consistent with the synthetic reconciliation
-- row, but it is not exclusive proof. Keep the evidence private and require an
-- explicit operator decision instead of performing another automatic restore
-- or revoke.

begin;

lock table private.unproven_group_creator_membership_audit
  in share row exclusive mode;

alter table private.unproven_group_creator_membership_audit
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'private.unproven_group_creator_membership_audit'::regclass
      and conname = 'unproven_group_creator_membership_review_status_check'
  ) then
    alter table private.unproven_group_creator_membership_audit
      add constraint unproven_group_creator_membership_review_status_check
      check (review_status in ('pending', 'confirmed_restore', 'confirmed_revoke'));
  end if;
end
$$;

comment on table private.unproven_group_creator_membership_audit is
  'Private evidence only. Rows require manual provenance review; no automatic membership mutation is authorized.';

do $$
declare
  pending_count bigint;
begin
  select count(*)
  into pending_count
  from private.unproven_group_creator_membership_audit
  where review_status = 'pending';

  raise notice 'Unproven group creator membership rows pending private review: %',
    pending_count;
end
$$;

revoke all on table private.unproven_group_creator_membership_audit
  from public, anon, authenticated;

commit;
