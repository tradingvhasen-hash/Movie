-- Sign-up was failing outright: "Database error saving new user".
--
-- Found by testing the real flow against the real project rather than
-- assuming it worked. The first account ever created on this database could
-- not be created, and nothing in the app would have said why — the browser
-- gets a generic 500 from the auth service.
--
-- The cause is a Supabase-specific footgun in the trigger that creates a
-- profile row on signup. `gen_random_bytes` lives in the `extensions` schema,
-- not `public`, and a SECURITY DEFINER function runs with a restricted
-- search_path that does not include it. The function was written as if it
-- were an ordinary query, where the extension schema *is* on the path.
--
-- Two changes, and the second matters more than the first:
--
--   1. pin the search_path so the function can find the extension
--   2. make the trigger unable to block a signup at all
--
-- A profile row is a convenience — a display name and a share slug. It is not
-- worth an account. Wrapping the insert so any failure is swallowed means the
-- worst case becomes "this user has no profile row yet" instead of "this
-- person cannot sign up", and the row can be backfilled at any time.
--
-- The same schema problem sits in the default on lists.share_slug, which
-- would have failed the first time anyone created a list. Fixed here too,
-- before it can be found the hard way.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    insert into public.profiles (id, display_name, public_slug)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      encode(extensions.gen_random_bytes(4), 'hex')
    )
    on conflict (id) do nothing;
  exception when others then
    -- a missing profile row is recoverable; a blocked signup is not
    null;
  end;
  return new;
end;
$$;

alter table public.lists
  alter column share_slug set default encode(extensions.gen_random_bytes(6), 'hex');

-- Backfill anyone who signed up while the trigger was broken. Nobody has yet,
-- but this makes the migration correct rather than merely timely.
insert into public.profiles (id, display_name, public_slug)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  encode(extensions.gen_random_bytes(4), 'hex')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
