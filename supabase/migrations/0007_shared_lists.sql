-- Sharing a list without the database having an opinion about films.
--
-- The share page used to join `list_items` to `public.titles` so the server
-- could render posters. `titles` holds whatever the seed script last uploaded,
-- and migration 0006 dropped the foreign key precisely because the catalog the
-- browser ranks against is 15,083 rows and that table is not. Joining it again
-- would mean a shared list silently losing most of its films.
--
-- So the server returns ids and the browser resolves them from the catalog it
-- has already downloaded. That is strictly better: it works for every title,
-- it renders the same names and posters as the rest of the app, and the share
-- page stops being the one screen with its own idea of what a film is.

-- Sharing anonymously is a per-list choice, not an account setting: a person
-- may want their name on a carefully built list and not on a guilty-pleasures
-- one. Default false — the name shows unless they ask otherwise.
alter table public.lists add column if not exists hide_owner boolean not null default false;

-- Copying someone's list is the main way a person arrives with an empty
-- account, so it needs to be one insert rather than a round trip per film.
alter table public.lists add column if not exists source_list_id uuid;

-- The share page reads by slug for anonymous visitors; without this every
-- open is a sequential scan once there are more than a few thousand lists.
create index if not exists lists_share_slug_idx on public.lists (share_slug);
create index if not exists list_items_list_idx on public.list_items (list_id);

-- A profile row must exist before a list can name its owner. The signup
-- trigger creates one, but accounts made before that trigger shipped have
-- none, and a missing row makes the share page say "—" instead of a name.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', 'dhawq')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
