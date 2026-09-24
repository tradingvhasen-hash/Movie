import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "not_signed_in" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
        return String(keys.default ?? "");
      } catch {
        return "";
      }
    })();

  const secret =
    (() => {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
        return String(keys.default ?? "");
      } catch {
        return "";
      }
    })() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!url || !anon || !secret) {
    return json({ error: "server_not_configured" }, 503);
  }

  // Authenticate as the caller first. The request never supplies a user id.
  const asUser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser(token);
  if (whoError || !who.user) return json({ error: "not_signed_in" }, 401);

  // Secret/service role exists only inside the hosted Edge Function. Deleting
  // auth.users is the one destructive operation; verified FK cascades remove
  // profiles, swipes, taste, lists and list_items together.
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(who.user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ ok: true });
});
