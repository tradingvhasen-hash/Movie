-- Security and data-integrity hardening after the 2026-09-24 full audit.
--
-- Additive only: historical migrations may already be applied in production,
-- so fixes live in a new migration instead of rewriting old history.

-- Public profiles expose only explicit likes. Dislikes, neutral-seen answers
-- and not-seen answers are private even when the profile itself is public.
drop policy if exists "public library readable" on public.swipes;
create policy "public liked library readable" on public.swipes
  for select using (
    action = 'liked'
    and exists (
      select 1
      from public.profiles p
      where p.id = swipes.user_id
        and p.is_public
    )
  );

-- A local list needs a stable identity that survives device sync. Local list
-- ids from older builds are not UUIDs, so keep the database primary key and
-- add a separate client id rather than coercing or replacing existing rows.
alter table public.lists add column if not exists client_id text;
create unique index if not exists lists_user_client_id_unique
  on public.lists (user_id, client_id)
  where client_id is not null;

-- Helpful for deterministic reconciliation and profile editing.
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
