-- Sharing a list: who wrote it, and the option of nobody.
--
-- ── WHY THIS FILE REPLACES TWO ─────────────────────────────────────────────
--
-- There were two migrations numbered 0007, written a few hours apart, and they
-- implemented the same feature under two different column names:
-- `lists.share_anonymous` and `lists.hide_owner`. The application only ever
-- read and wrote `hide_owner`.
--
-- That was not merely untidy. The row-level-security policy that decides
-- whether a stranger may read the owner's name gated on `share_anonymous` —
-- a column nothing sets. So a list published with "don't put my name on this"
-- would have set `hide_owner = true`, the policy would have looked at
-- `share_anonymous = false`, and the name would have been readable anyway.
-- A privacy control that silently does nothing is worse than not offering it.
--
-- This is the single 0007. It is idempotent: safe on a fresh database, and
-- safe if either of the previous two files was already run.

-- ── who wrote the list ─────────────────────────────────────────────────────
-- `profiles` held a display name and nothing else, so a share page could say a
-- name and could not show a face or say anything about the person.
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;

-- ── sharing without your name ──────────────────────────────────────────────
-- Per list, not per account: the same person may want their name on a
-- carefully built favourites list and not on a guilty-pleasures one. Default
-- false — the name shows unless they ask otherwise.
alter table public.lists add column if not exists hide_owner boolean not null default false;

-- Copying someone's list is the main way a person arrives with an empty
-- account, so it needs to be one insert rather than a round trip per film.
alter table public.lists add column if not exists source_list_id uuid;

-- If the superseded migration ran, carry anything it recorded across before
-- removing it, so no existing choice is lost. Nothing writes this column, so
-- in practice this updates nothing — it exists so that "in practice" is not
-- what the data depends on.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lists' and column_name = 'share_anonymous'
  ) then
    update public.lists set hide_owner = true where share_anonymous;
    alter table public.lists drop column share_anonymous;
  end if;
end $$;

-- ── who may read a profile ─────────────────────────────────────────────────
-- Anyone opening a public list needs to read the owner's name and picture. The
-- original policy required the whole profile to be marked public, which is a
-- different question from "did you publish a list", and requiring both meant a
-- published list always said "—".
--
-- The `not l.hide_owner` clause is the actual enforcement of the anonymity
-- checkbox: with it true, no policy grants a stranger the owner's row.
drop policy if exists "profiles behind public lists readable" on public.profiles;
create policy "profiles behind public lists readable" on public.profiles
  for select using (
    exists (
      select 1 from public.lists l
      where l.user_id = profiles.id
        and l.is_public
        and not l.hide_owner
    )
  );

-- ── the database stops having an opinion about films ───────────────────────
-- `list_items` pointed at `titles`, which holds whatever the seed script last
-- uploaded — a few hundred rows against a catalog of 15,083. A list could
-- therefore only ever contain titles that happened to be in that small table,
-- which is the same fault migration 0006 removed from `swipes`. The share page
-- now carries ids and the browser resolves them against the catalog it has
-- already downloaded: it works for every title, renders the same names and
-- posters as the rest of the app, and the share page stops being the one
-- screen with its own idea of what a film is.
alter table public.list_items drop constraint if exists list_items_title_id_fkey;

-- ── reading a share link ───────────────────────────────────────────────────
-- The share page reads by slug for anonymous visitors; without this every open
-- is a sequential scan once there are more than a few thousand lists.
create index if not exists lists_share_slug_idx on public.lists (share_slug);
create index if not exists list_items_list_idx on public.list_items (list_id);

-- A profile row must exist before a list can name its owner. The signup
-- trigger creates one, but accounts made before that trigger shipped have
-- none, and a missing row makes the share page say "—" instead of a name.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', 'Seenit reader')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
