-- Store product reviews: one verified-owner review per user/product.

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_reviews_user_product_unique unique (user_id, product_id),
  constraint store_reviews_title_length_check check (title is null or char_length(title) <= 120),
  constraint store_reviews_body_length_check check (body is null or char_length(body) <= 5000)
);

comment on table public.store_reviews is
  'Verified owner reviews for real store products.';

create index if not exists store_reviews_product_created_idx
  on public.store_reviews (product_id, created_at desc);

create index if not exists store_reviews_user_idx
  on public.store_reviews (user_id);

create or replace function public.ensure_store_review_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.store_licenses license
    where license.user_id = new.user_id
      and license.product_id = new.product_id
      and license.is_revoked = false
      and (license.expires_at is null or license.expires_at > now())
  ) then
    raise exception 'Cannot review a store product without an active license';
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_store_review_license() from public, anon, authenticated;

create or replace function public.refresh_store_product_review_stats(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.store_products product
  set
    rating = stats.rating,
    ratings_count = stats.ratings_count,
    updated_at = now()
  from (
    select
      case
        when count(*) = 0 then null
        else round(avg(review.rating)::numeric, 1)
      end as rating,
      count(*)::integer as ratings_count
    from public.store_reviews review
    where review.product_id = p_product_id
      and review.is_published = true
  ) stats
  where product.id = p_product_id;
end;
$$;

revoke execute on function public.refresh_store_product_review_stats(uuid) from public, anon, authenticated;

create or replace function public.refresh_store_product_review_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_store_product_review_stats(old.product_id);
    return old;
  end if;

  perform public.refresh_store_product_review_stats(new.product_id);

  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    perform public.refresh_store_product_review_stats(old.product_id);
  end if;

  return new;
end;
$$;

revoke execute on function public.refresh_store_product_review_stats_trigger()
  from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_store_reviews_updated_at') then
    create trigger set_store_reviews_updated_at
      before update on public.store_reviews
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'ensure_store_review_license_before_write') then
    create trigger ensure_store_review_license_before_write
      before insert or update of user_id, product_id on public.store_reviews
      for each row execute function public.ensure_store_review_license();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'refresh_store_product_review_stats_after_write') then
    create trigger refresh_store_product_review_stats_after_write
      after insert or update or delete on public.store_reviews
      for each row execute function public.refresh_store_product_review_stats_trigger();
  end if;
end $$;

grant select on public.store_reviews to anon, authenticated;
grant insert, update, delete on public.store_reviews to authenticated;

alter table public.store_reviews enable row level security;

drop policy if exists store_reviews_read_published_product on public.store_reviews;
create policy store_reviews_read_published_product
  on public.store_reviews
  for select to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.store_products product
      where product.id = store_reviews.product_id
        and product.status = 'published'
    )
  );

drop policy if exists store_reviews_owner_read on public.store_reviews;
create policy store_reviews_owner_read
  on public.store_reviews
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists store_reviews_owner_insert on public.store_reviews;
create policy store_reviews_owner_insert
  on public.store_reviews
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.store_licenses license
      where license.user_id = auth.uid()
        and license.product_id = store_reviews.product_id
        and license.is_revoked = false
        and (license.expires_at is null or license.expires_at > now())
    )
  );

drop policy if exists store_reviews_owner_update on public.store_reviews;
create policy store_reviews_owner_update
  on public.store_reviews
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.store_licenses license
      where license.user_id = auth.uid()
        and license.product_id = store_reviews.product_id
        and license.is_revoked = false
        and (license.expires_at is null or license.expires_at > now())
    )
  );

drop policy if exists store_reviews_owner_delete on public.store_reviews;
create policy store_reviews_owner_delete
  on public.store_reviews
  for delete to authenticated
  using (auth.uid() = user_id);
