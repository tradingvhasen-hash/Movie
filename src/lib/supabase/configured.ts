/**
 * "Is the cloud switched on?" — answerable without the cloud.
 *
 * This lived in `client.ts`, next to `getSupabase()`, which is the natural
 * place for it and cost 230 KB. `client.ts` statically imports
 * `@supabase/supabase-js`, and `useDeck` imported this one function from it —
 * so the entire Supabase SDK was pulled onto the swipe screen's critical path,
 * parsed and evaluated before the first card, to read two environment
 * variables that Next inlines as string literals at build time.
 *
 * Nothing on the swipe screen talks to Supabase. Auth, sync and share links
 * live on Lists, Profile and the shared-list pages, which are separate routes
 * and load it there.
 *
 * So the question gets its own module, with no imports at all. Anything that
 * needs the actual client keeps importing `client.ts` and pays for it where it
 * is used.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
