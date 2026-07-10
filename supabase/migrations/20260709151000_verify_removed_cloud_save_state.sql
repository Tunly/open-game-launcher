-- Forward-only verification for the already-applied cloud-save removal. It
-- closes the deployment window by refusing to proceed if metadata or objects
-- appeared after the original migration completed.

begin;

lock table storage.objects in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'game-saves'
  ) then
    raise exception
      'Cloud-save removal is incomplete: the game-saves bucket contains objects.';
  end if;

  if to_regclass('public.user_cloud_save_files') is not null
    or to_regclass('public.user_cloud_save_sets') is not null
  then
    raise exception
      'Cloud-save removal is incomplete: first-party metadata tables still exist.';
  end if;
end
$$;

commit;
