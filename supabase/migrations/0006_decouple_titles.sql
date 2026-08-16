-- The catalog lives in the browser, and the database was overruling it.
--
-- `swipes.title_id` and `list_items.title_id` both carried a foreign key into
-- `public.titles`, which holds whatever the seed script last uploaded. The
-- catalog the app actually ranks against is 15,083 titles and grows whenever a
-- band is extended, so the two drift apart immediately and the client had to
-- filter every swipe against the small table before uploading. Everything else
-- was dropped, with no error raised anywhere: swipe a thousand cards, sign in
-- on another device, find a few dozen.
--
-- A title id here is `movie-27205` — TMDB's own identifier with a kind prefix.
-- It is meaningful without a row in `titles` to point at, so the constraint was
-- buying nothing and costing most of the data.
alter table public.swipes drop constraint if exists swipes_title_id_fkey;
alter table public.list_items drop constraint if exists list_items_title_id_fkey;

-- The grid writes a fourth answer that the original check constraint predates.
alter table public.swipes drop constraint if exists swipes_action_check;
alter table public.swipes add constraint swipes_action_check
  check (action in ('liked', 'disliked', 'not_seen', 'seen'));

-- Exposure tables — "has this person watched it" — kept apart from taste.
alter table public.user_taste add column if not exists seen_facets jsonb;
