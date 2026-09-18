import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * DELETING AN ACCOUNT, PROPERLY.
 *
 * There was no way to do this at all. A person who signed in could not get out
 * — no button, no page, no email address to write to. That is a blocker for
 * publishing anywhere with GDPR reach, which is anywhere, and it is also just
 * a thing a product owes the people who use it.
 *
 * WHY IT NEEDS A SERVER AT ALL, given the browser already talks to Supabase.
 * The person's *rows* can be removed from the browser: they own them and the
 * row-level policies allow it. Their *auth account* cannot. Removing that
 * requires `auth.admin.deleteUser`, which requires the service-role key, and
 * the service-role key bypasses every row-level policy in the database. It
 * must never reach a browser — not in a bundle, not behind a flag, not
 * prefixed with NEXT_PUBLIC_. So the last step happens here, on the server,
 * where the key can exist.
 *
 * WHAT "DELETE" MEANS HERE. It means deleted. Not hidden, not flagged, not
 * retained-for-analytics. If a product tells someone their data is gone and it
 * is not, the word has been spent for nothing.
 *
 * The caller proves who it is with its own access token rather than by naming
 * a user id, so this endpoint cannot be used to delete somebody else: the
 * token is exchanged for a user id against Supabase before anything is
 * touched.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  /* who is asking — established from the token, never from the request body */
  const asUser = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who?.user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const userId = who.user.id;

  /**
   * The rows go first, through the caller's own token.
   *
   * Deliberately not the service-role client: doing it as the user means the
   * row-level policies are enforced on a deletion too, so a bug here can only
   * ever delete this person's own data. Using the master key for work the
   * ordinary key can do is how a delete-my-account button becomes a
   * delete-anyone's-account button.
   */
  const tables = ["swipes", "list_items", "lists", "user_taste", "profiles"] as const;
  const failed: string[] = [];
  for (const table of tables) {
    /* list_items has no user_id — it hangs off lists, which do */
    const query =
      table === "list_items"
        ? asUser.from(table).delete().in(
            "list_id",
            ((await asUser.from("lists").select("id").eq("user_id", userId)).data ?? []).map(
              (r: { id: string }) => r.id
            )
          )
        : asUser.from(table).delete().eq("user_id", userId);
    const { error } = await query;
    /* a table that does not exist in this project is not a failure to report
       to the person trying to leave */
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      failed.push(`${table}: ${error.message}`);
    }
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: failed[0], stage: "data" }, { status: 500 });
  }

  if (!service) {
    /**
     * The data is gone and the login is not. Reported honestly rather than as
     * a success, because the difference matters to the person: they can sign
     * in again and find an empty account, which is not what they asked for.
     *
     * Set SUPABASE_SERVICE_ROLE_KEY in the Render environment to complete it.
     */
    return NextResponse.json(
      { ok: true, dataDeleted: true, authDeleted: false, reason: "no_service_key" },
      { status: 200 }
    );
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    return NextResponse.json({ error: authError.message, stage: "auth" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dataDeleted: true, authDeleted: true });
}
