-- The grid answers "have you watched it" and writes `seen`, an action the
-- swipes table has never accepted: 0001 constrained it to liked / disliked /
-- not_seen. Every grid tap has therefore failed to sync since the grid
-- shipped, silently, while local state looked correct.
--
-- Found by review, not by any instrument here.
alter table public.swipes
  drop constraint if exists swipes_action_check;

alter table public.swipes
  add constraint swipes_action_check
  check (action in ('liked', 'disliked', 'not_seen', 'seen'));

-- the exposure model's own facet tables, kept beside the taste ones
alter table public.user_taste
  add column if not exists seen_facets jsonb;
