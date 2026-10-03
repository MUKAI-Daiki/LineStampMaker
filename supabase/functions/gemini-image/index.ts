import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_DOMAIN = "nua.ac.jp";
const ADMIN_EMAIL = "d-mukai@nua.ac.jp";

const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
]);

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_PROMPT_CHARS = 20000;

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

  if (req.method !== "POST") {
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
  const appMeta = (user.app_metadata ?? {}) as { provider?: string; providers?: string[] };
  const isGoogleIdentity = appMeta.provider === "google" ||
    (Array.isArray(appMeta.providers) && appMeta.providers.includes("google"));
  const emailVerified = !!user.email_confirmed_at;
  // 大学ドメインだけでは不十分。確認済みかつ Google 認証の本人であることを要求する
  if (!email.endsWith("@" + ALLOWED_DOMAIN) || !emailVerified || !isGoogleIdentity) {
    return json({ error: "Forbidden" }, 403);
  }

  const declaredLength = Number(req.headers.get("Content-Length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let payload: { model?: unknown; prompt?: unknown; imageBase64?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const model = typeof payload.model === "string" ? payload.model : "";
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageBase64 = typeof payload.imageBase64 === "string" ? payload.imageBase64 : "";

  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: "Invalid request" }, 400);
  }
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: "Invalid request" }, 400);
  }
  if (!imageBase64 || !/^[A-Za-z0-9+/=\s]+$/.test(imageBase64)) {
    return json({ error: "Invalid request" }, 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "Image generation is not configured on the server." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const isAdmin = email === ADMIN_EMAIL;

  if (!isAdmin) {
    const { data: remaining, error: consumeError } = await admin.rpc("consume_stamina_for", {
      p_user: user.id,
      p_model: model,
    });
    if (consumeError || typeof remaining !== "number") {
      console.error("stamina consume failed", consumeError);
      return json({ error: "Server error" }, 500);
    }
    if (remaining < 0) {
      return json({ error: "Insufficient stamina" }, 402);
    }
  }

  const refund = async () => {
    if (isAdmin) return;
    const { error } = await admin.rpc("refund_stamina_for", { p_user: user.id, p_model: model });
    if (error) console.error("stamina refund failed", error);
  };

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "image/png", data: imageBase64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { seed: 42 },
        }),
      },
    );
  } catch (err) {
    console.error("Gemini fetch failed", err);
    await refund();
    return json({ error: "Upstream error" }, 502);
  }

  if (!upstream.ok) {
    // 上流の詳細はクライアントへ返さない（内部情報の露出防止）
    console.error("Gemini upstream error", upstream.status, await upstream.text());
    await refund();
    return json({ error: "Upstream error" }, upstream.status === 429 ? 429 : 502);
  }

  let data: { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  try {
    data = await upstream.json();
  } catch {
    await refund();
    return json({ error: "Upstream error" }, 502);
  }
  // 上流が正常応答した時点で生成は実行済み。画像が無くても返金はしない（無限無料生成の防止）
  return json(data, 200);
});
