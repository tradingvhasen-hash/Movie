import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Delete the authenticated Supabase user and rely on the schema's
 * ON DELETE CASCADE foreign keys for all user-owned rows.
 *
 * This is intentionally all-or-nothing from the application's point of view:
 * without the server-only service role key we refuse before touching data.
 * The old implementation deleted tables one by one and could fail halfway,
 * leaving a live login with only part of its library remaining.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  if (!service) {
    return NextResponse.json(
      { error: "account_deletion_not_configured" },
      { status: 503 }
    );
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  // Derive identity from the caller's token. Never accept a user id from the body.
  const asUser = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who.user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  // The service role never leaves this server route. Deleting auth.users is
  // the single destructive operation; profiles/swipes/taste/lists cascade.
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(who.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
