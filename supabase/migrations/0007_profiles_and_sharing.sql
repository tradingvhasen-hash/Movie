-- A shared list needs a person behind it, and the option of not having one.
--
-- `profiles` held a display name and nothing else, so a share page could say a
-- name and could not show a face or say anything about who wrote the list. And
-- `lists` had no way to record "share this without my name on it", which the
-- product needs as a *per-list* choice rather than an account-wide one: the
-- same person may want their name on a curated favourites list and not on a
-- guilty-pleasures one.
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;

-- per list, not per account: see above
alter table public.lists add column if not exists share_anonymous boolean not null default false;

-- Anyone opening a public list needs to read the owner's name and picture, and
-- the existing policy only exposed profiles whose owner had marked the whole
-- profile public. That is a different question from "did you publish a list",
-- and requiring both meant a published list always said "—".
drop policy if exists "profiles behind public lists readable" on public.profiles;
create policy "profiles behind public lists readable" on public.profiles
  for select using (
    exists (
      select 1 from public.lists l
      where l.user_id = profiles.id
        and l.is_public
        and not l.share_anonymous
    )
  );

-- list_items pointed at `titles`, which holds whatever the seed script last
-- uploaded — a few hundred rows against a catalog of 15,083. A list could
-- therefore only ever contain titles that happened to be in that small table,
-- which is the same fault migration 0006 removed from `swipes`. The share page
-- now carries ids and the browser resolves them against the catalog it already
-- has, so the database never needs to know what a title is.
alter table public.list_items drop constraint if exists list_items_title_id_fkey;
