const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function withCors(body: BodyInit | null, init: ResponseInit) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v as string);
  return new Response(body, { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 200 });

  try {
    const url = new URL(req.url);
    const z = Number(url.searchParams.get("z"));
    const x = Number(url.searchParams.get("x"));
    const y = Number(url.searchParams.get("y"));
    if (![z, x, y].every(Number.isFinite)) {
      return withCors(JSON.stringify({ error: "Missing or invalid z/x/y" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !ANON) {
      return withCors(JSON.stringify({ error: "Server config error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/parcels_mvt_b64`;
    const upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ z, x, y }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("RPC error", upstream.status, text, { z, x, y });
      // Treat as empty tile for UX; prevents red 500s in the browser
      return withCors(null, {
        status: 204,
        status: 204,
        headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
      });
    }

    let b64: string | null = text.trim();
    try {
      const j = JSON.parse(text);
      if (typeof j === "string") b64 = j;
      else if (j && typeof j === "object") b64 = (j as any).parcels_mvt_b64 ?? null;
    } catch {}

    if (!b64) {
      return withCors(null, {
        status: 204,
        headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
      });
    }

    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return withCors(bin, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (err) {
    console.error("Edge exception", err);
    return withCors(JSON.stringify({ error: "server_error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});