-- Dhawq — initial schema
-- Apply in the Supabase SQL editor (or `supabase db push`).
-- Requires the pgvector extension (enabled by default on Supabase).

create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────
-- Catalog
-- ─────────────────────────────────────────────────────────────
create table if not exists public.titles (
  id text primary key,                        -- "movie-603" / "tv-1396"
  tmdb_id integer not null,
  type text not null check (type in ('movie', 'tv')),
  title_en text not null,
  title_ar text not null default '',
  overview_en text not null default '',
  overview_ar text not null default '',
  year integer not null default 0,
  genres text[] not null default '{}',
  keywords text[] not null default '{}',
  director text,
  cast_names text[] not null default '{}',
  original_language text not null default 'en',
  rating numeric not null default 0,
  vote_count integer not null default 0,
  popularity numeric not null default 0,
  poster_path text,
  backdrop_path text,
  onboarding boolean not null default false,
  feature_vector vector(384) not null,
  updated_at timestamptz not null default now()
);

create index if not exists titles_vector_idx
  on public.titles using hnsw (feature_vector vector_cosine_ops);
create index if not exists titles_popularity_idx on public.titles (popularity desc);
create index if not exists titles_onboarding_idx on public.titles (onboarding) where onboarding;

-- Precomputed nearest neighbours (content-based "similar titles")
create table if not exists public.item_similarity (
  title_id text not null references public.titles (id) on delete cascade,
  similar_title_id text not null references public.titles (id) on delete cascade,
  score real not null,
  primary key (title_id, similar_title_id)
);

-- ─────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  public_slug text unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null references public.titles (id) on delete cascade,
  action text not null check (action in ('liked', 'disliked', 'not_seen')),
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
create index if not exists swipes_user_idx on public.swipes (user_id, created_at desc);

-- Taste fingerprint (computed client-side, stored for cross-device continuity
-- and server-side candidate generation)
create table if not exists public.user_taste (
  user_id uuid primary key references auth.users (id) on delete cascade,
  taste vector(384) not null,
  rated_swipes integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_public boolean not null default false,
  share_slug text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.list_items (
  list_id uuid not null references public.lists (id) on delete cascade,
  title_id text not null references public.titles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, title_id)
);

-- Collaborative signal: how often two titles are liked by the same user.
-- Refreshed periodically (see refresh_co_occurrence + pg_cron below).
create table if not exists public.co_occurrence (
  title_a text not null,
  title_b text not null,
  both_liked integer not null,
  primary key (title_a, title_b)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.titles enable row level security;
alter table public.item_similarity enable row level security;
alter table public.profiles enable row level security;
alter table public.swipes enable row level security;
alter table public.user_taste enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.co_occurrence enable row level security;

-- catalog is world-readable
create policy "titles are public" on public.titles for select using (true);
create policy "similarity is public" on public.item_similarity for select using (true);
create policy "co-occurrence is public" on public.co_occurrence for select using (true);

-- profiles: owner full access; public profiles readable by anyone
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "public profiles readable" on public.profiles
  for select using (is_public);

-- swipes: owner full access; liked swipes of public profiles readable (share page)
create policy "own swipes" on public.swipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public library readable" on public.swipes
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = swipes.user_id and p.is_public
    )
  );

-- taste: owner only
create policy "own taste" on public.user_taste
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- lists: owner full access; public lists readable
create policy "own lists" on public.lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public lists readable" on public.lists
  for select using (is_public);

-- list items follow their list's visibility
create policy "own list items" on public.list_items
  for all using (
    exists (select 1 from public.lists l where l.id = list_items.list_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.lists l where l.id = list_items.list_id and l.user_id = auth.uid())
  );
create policy "public list items readable" on public.list_items
  for select using (
    exists (select 1 from public.lists l where l.id = list_items.list_id and l.is_public)
  );

-- ─────────────────────────────────────────────────────────────
-- Recommendation RPC: stage-1 candidate generation with pgvector
-- ─────────────────────────────────────────────────────────────
create or replace function public.match_titles(
  query_vector vector(384),
  exclude_ids text[] default '{}',
  match_count integer default 200
)
returns setof public.titles
language sql stable
as $$
  select t.*
  from public.titles t
  where not (t.id = any (exclude_ids))
  order by t.feature_vector <=> query_vector
  limit match_count;
$$;

-- popular titles for pure cold start / calibration pool
create or replace function public.calibration_pool(
  exclude_ids text[] default '{}',
  pool_count integer default 80
)
returns setof public.titles
language sql stable
as $$
  select t.*
  from public.titles t
  where t.onboarding and not (t.id = any (exclude_ids))
  order by t.popularity desc
  limit pool_count;
$$;

-- Rebuild the precomputed nearest-neighbour table using the HNSW index.
-- Run once after seeding (SQL editor):  select public.rebuild_item_similarity();
create or replace function public.rebuild_item_similarity(top_k integer default 30)
returns void
language plpgsql security definer
as $$
begin
  truncate public.item_similarity;
  insert into public.item_similarity (title_id, similar_title_id, score)
  select t.id, n.id, n.score
  from public.titles t
  cross join lateral (
    select t2.id, (1 - (t2.feature_vector <=> t.feature_vector))::real as score
    from public.titles t2
    where t2.id <> t.id
    order by t2.feature_vector <=> t.feature_vector
    limit top_k
  ) n;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Collaborative co-occurrence refresh ("users who liked X also liked Y")
-- Schedule hourly with pg_cron (Dashboard → Database → Extensions → pg_cron):
--   select cron.schedule('refresh-cooc', '30 * * * *', 'select public.refresh_co_occurrence()');
-- ─────────────────────────────────────────────────────────────
create or replace function public.refresh_co_occurrence()
returns void
language plpgsql security definer
as $$
begin
  truncate public.co_occurrence;
  insert into public.co_occurrence (title_a, title_b, both_liked)
  select s1.title_id, s2.title_id, count(*)::int
  from public.swipes s1
  join public.swipes s2
    on s1.user_id = s2.user_id
   and s1.title_id <> s2.title_id
  where s1.action = 'liked' and s2.action = 'liked'
  group by s1.title_id, s2.title_id
  having count(*) >= 2;
end;
$$;

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (id, display_name, public_slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    encode(gen_random_bytes(4), 'hex')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
