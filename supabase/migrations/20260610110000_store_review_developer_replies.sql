-- Developer replies for store reviews. One current product developer reply per review.

create table if not exists public.store_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.store_reviews(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  developer_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_review_replies_review_unique unique (review_id),
  constraint store_review_replies_body_length_check check (char_length(body) between 1 and 1000)
);

comment on table public.store_review_replies is
  'One developer reply per visible store review, owned by the product developer.';

create index if not exists store_review_replies_product_idx
  on public.store_review_replies (product_id, updated_at desc);

create index if not exists store_review_replies_developer_idx
  on public.store_review_replies (developer_user_id, updated_at desc);

create or replace function public.ensure_store_review_reply_developer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_product_id uuid;
  product_developer_id uuid;
begin
  if tg_op = 'UPDATE'
    and (
      new.review_id is distinct from old.review_id
      or new.product_id is distinct from old.product_id
    )
  then
    raise exception 'Developer reply review target cannot be changed';
  end if;

  select review.product_id
  into review_product_id
  from public.store_reviews review
  where review.id = new.review_id;

  if review_product_id is null then
    raise exception 'Developer reply review does not exist';
  end if;

  if new.product_id is distinct from review_product_id then
    raise exception 'Developer reply product must match review product';
  end if;

  select product.developer_id
  into product_developer_id
  from public.store_products product
  where product.id = new.product_id;

  if product_developer_id is null
    or product_developer_id is distinct from new.developer_user_id
  then
    raise exception 'Developer reply author must own the store product';
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_store_review_reply_developer()
  from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_store_review_replies_updated_at'
      and tgrelid = 'public.store_review_replies'::regclass
  ) then
    create trigger set_store_review_replies_updated_at
      before update on public.store_review_replies
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'ensure_store_review_reply_developer_before_write'
      and tgrelid = 'public.store_review_replies'::regclass
  ) then
    create trigger ensure_store_review_reply_developer_before_write
      before insert or update of review_id, product_id, developer_user_id
      on public.store_review_replies
      for each row execute function public.ensure_store_review_reply_developer();
  end if;
end $$;

grant select on public.store_review_replies to anon, authenticated;
grant insert, update on public.store_review_replies to authenticated;
grant all on public.store_review_replies to service_role;

alter table public.store_review_replies enable row level security;

drop policy if exists store_review_replies_read_visible_reviews on public.store_review_replies;
create policy store_review_replies_read_visible_reviews
  on public.store_review_replies
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.store_reviews review
      join public.store_products product on product.id = review.product_id
      where review.id = store_review_replies.review_id
        and review.product_id = store_review_replies.product_id
        and review.is_published = true
        and review.is_hidden_by_reports = false
        and product.status = 'published'
    )
  );

drop policy if exists store_review_replies_developer_insert on public.store_review_replies;
create policy store_review_replies_developer_insert
  on public.store_review_replies
  for insert to authenticated
  with check (
    auth.uid() = developer_user_id
    and exists (
      select 1
      from public.store_products product
      where product.id = store_review_replies.product_id
        and product.developer_id = auth.uid()
    )
    and exists (
      select 1
      from public.store_reviews review
      where review.id = store_review_replies.review_id
        and review.product_id = store_review_replies.product_id
        and review.is_published = true
        and review.is_hidden_by_reports = false
    )
  );

drop policy if exists store_review_replies_developer_update on public.store_review_replies;
create policy store_review_replies_developer_update
  on public.store_review_replies
  for update to authenticated
  using (
    exists (
      select 1
      from public.store_products product
      where product.id = store_review_replies.product_id
        and product.developer_id = auth.uid()
    )
  )
  with check (
    auth.uid() = developer_user_id
    and exists (
      select 1
      from public.store_products product
      where product.id = store_review_replies.product_id
        and product.developer_id = auth.uid()
    )
    and exists (
      select 1
      from public.store_reviews review
      where review.id = store_review_replies.review_id
        and review.product_id = store_review_replies.product_id
        and review.is_published = true
        and review.is_hidden_by_reports = false
    )
  );
