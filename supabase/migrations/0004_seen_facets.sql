-- The exposure model gets a column.
--
-- Until now the engine answered "have you watched this?" with a global vote
-- count — one answer for the whole of humanity — and weighted that answer more
-- heavily than the entire taste term. That was never tested, and could not be:
-- every simulated viewer in this repo is *defined* as someone who knows the
-- most-voted titles, so fame predicts recognition by construction.
--
-- One real 449-swipe export settled it. Predicting the second half of the
-- session from the first: fame scored AUC 0.453, below a coin flip; the same
-- viewer's own genres and decade scored 0.707; the two together, 0.704. Fame
-- carried nothing and added nothing.
--
-- So a second set of facet tables now learns the answer per person, from the
-- swipe-ups that used to be spent on almost nothing. This is where they live
-- between devices. Nullable with no default: a row written before this
-- migration comes back empty, and empty is the correct starting state — the
-- fame prior carries alone until the tables fill.

alter table public.user_taste
  add column if not exists seen_facets jsonb;

comment on column public.user_taste.seen_facets is
  'Per-value evidence for "has this person watched this?", learned from every '
  'swipe: watched (liked or disliked) writes +1, not-seen writes -1. Blended '
  'against the global fame prior by how many swipes the account has logged.';
