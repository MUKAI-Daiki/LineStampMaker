import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_EMAIL = "d-mukai@nua.ac.jp";
const ALLOWED_DOMAIN = "nua.ac.jp";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const email = (user.email ?? "").toLowerCase();
  if (email !== ADMIN_EMAIL) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // GET: list all users with their activity info
  if (req.method === "GET") {
    const { data: staminaRows, error: staminaError } = await admin
      .from("user_stamina")
      .select("user_id, stamina, last_seen_at, last_login_at");

    if (staminaError) {
      console.error("Failed to load stamina rows", staminaError);
      return json({ error: "Server error" }, 500);
    }

    const { data: authUsers, error: authError } = await admin.auth.admin.listUsers();
    if (authError) {
      console.error("Failed to list auth users", authError);
      return json({ error: "Server error" }, 500);
    }

    const staminaMap = new Map(
      (staminaRows ?? []).map((s: { user_id: string; stamina: number; last_seen_at: string; last_login_at: string }) => [s.user_id, s])
    );

    const users = authUsers.users
      .filter((u: { email?: string }) => (u.email ?? "").toLowerCase().endsWith("@" + ALLOWED_DOMAIN))
      .map((u: { id: string; email?: string; created_at?: string; email_confirmed_at?: string | null }) => {
        const s = staminaMap.get(u.id) as { stamina?: number; last_seen_at?: string; last_login_at?: string } | undefined;
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_seen_at: s?.last_seen_at ?? u.created_at,
          stamina: s?.stamina ?? 50,
          is_admin: (u.email ?? "").toLowerCase() === ADMIN_EMAIL,
        };
      })
      .sort((a: { last_seen_at: string }, b: { last_seen_at: string }) => b.last_seen_at.localeCompare(a.last_seen_at));

    return json({ users });
  }

  // POST: delete a specific user
  if (req.method === "POST") {
    let payload: { userId?: unknown };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const targetUserId = typeof payload.userId === "string" ? payload.userId : "";
    if (!targetUserId) {
      return json({ error: "Invalid request" }, 400);
    }

    // Prevent self-deletion
    if (targetUserId === user.id) {
      return json({ error: "Cannot delete your own account" }, 400);
    }

    const { error: deleteError } = await admin.rpc("admin_delete_user", { p_user_id: targetUserId });
    if (deleteError) {
      console.error("admin_delete_user failed", deleteError);
      return json({ error: "Failed to delete user" }, 500);
    }

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
});
