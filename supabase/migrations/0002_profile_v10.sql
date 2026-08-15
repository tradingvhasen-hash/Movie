-- Bring the stored taste up to what the engine actually uses.
--
-- `user_taste` was written when a viewer's taste WAS a 384-dimension vector.
-- It is not any more, and has not been since the facet tables shipped. The
-- profile the engine ranks with today is eleven fields; this table held two of
-- them. Connecting sign-in to the cloud without this migration would have
-- saved a blended direction and a swipe count, dropped the per-value evidence
-- that is the taste, and shown the user a site that had forgotten them
-- overnight — with no error anywhere to notice.
--
-- What is added, and why each one matters rather than being tidy:
--
--   facets         the tables the ranking reads. Six named maps of
--                  value -> [net evidence, observation mass]. THIS is the
--                  taste; everything else is support.
--   facet_weights  how much each facet matters to this person, learned from
--                  their swipes. Two viewers with identical likes rank
--                  differently if one follows directors and the other stories.
--   streaks        benched values and their cooldown clock. Without it a
--                  returning viewer is shown the thing they just skipped
--                  three times.
--   seen_count     the recognition ledger. It sets how deep the fame gate
--   unseen_count   reaches, so losing it resets a heavy viewer to a
--                  beginner's pool.
--   total_swipes   the clock the cooldowns above are measured against.
--   liked_sum      centroids for diversity and "because you liked X".
--   liked_count
--   disliked_sum
--   disliked_count
--   recent         ordered tokens from recent likes. Nothing reads it today
--                  (the sequence experiment is recorded as not shipped), but
--                  it is cheap and a future test needs the history to exist.
--
-- jsonb rather than columns per facet: the facet list is the engine's own
-- business and has changed twice already. The database should not need a
-- migration when a seventh facet is added.
--
-- `taste` stays and stays NOT NULL — pgvector candidate generation in
-- `/api/recommend` still queries it. It is now a derived field rather than
-- the fingerprint.

alter table public.user_taste
  add column if not exists facets jsonb not null default '{}'::jsonb,
  add column if not exists facet_weights jsonb not null default '{}'::jsonb,
  add column if not exists streaks jsonb not null default '{}'::jsonb,
  add column if not exists liked_sum real[] not null default '{}',
  add column if not exists liked_count integer not null default 0,
  add column if not exists disliked_sum real[] not null default '{}',
  add column if not exists disliked_count integer not null default 0,
  add column if not exists total_swipes integer not null default 0,
  add column if not exists seen_count integer not null default 0,
  add column if not exists unseen_count integer not null default 0,
  add column if not exists recent jsonb not null default '[]'::jsonb;

-- Every existing row predates the facet engine and carries a taste the engine
-- can no longer read. Rather than leave rows that look complete and are not,
-- mark them: the client treats a null as "nothing stored" and keeps whatever
-- is in local storage, which is the safe direction.
comment on column public.user_taste.facets is
  'value -> [net evidence, observation mass] per facet. Empty means this row
   was written before the facet engine and must not be trusted as a taste.';

-- Swipes are the source of truth a profile can always be rebuilt from, so the
-- ledger above is a cache. This index makes the rebuild cheap.
create index if not exists swipes_user_action_idx
  on public.swipes (user_id, action);
