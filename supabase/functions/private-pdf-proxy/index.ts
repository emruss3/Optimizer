import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
if (!dbUrl) throw new Error("SUPABASE_DB_URL is unavailable");
const sql = postgres(dbUrl, { max:1, prepare:false, connect_timeout:15, idle_timeout:10 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function directUrl(source:string):string {
  const u = new URL(source);
  if (u.hostname.includes("dropbox.com")) u.searchParams.set("dl","1");
  return u.toString();
}

Deno.serve(async(req:Request)=>{
  if (!['GET','HEAD'].includes(req.method)) return new Response('GET or HEAD required',{status:405});
  const u = new URL(req.url);
  const artifactId = u.searchParams.get('artifact_id');
  const token = u.searchParams.get('token');
  if (!artifactId || !token || !UUID.test(artifactId) || !UUID.test(token)) return new Response('invalid capability',{status:400});

  const rows = await sql<{source_url:string;name:string}[]>`
    select a.source_url,a.name
    from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id
    where a.id=${artifactId}::uuid
      and a.metadata->>'viewer_token'=${token}
      and (a.metadata->>'viewer_expires_at')::timestamptz > now()
      and d.metadata->>'source_confidentiality'='private_project_documents'
      and a.file_format='pdf'
  `;
  const doc = rows[0];
  if (!doc) return new Response('expired or unauthorized capability',{status:401});

  const requestHeaders:Record<string,string> = {
    'accept':'application/pdf,application/octet-stream',
    'user-agent':'Parcelmap-Private-PDF-Proxy/1.0'
  };
  const range = req.headers.get('range');
  if (range) requestHeaders['range'] = range;
  const upstream = await fetch(directUrl(doc.source_url),{
    method:req.method,
    redirect:'follow',
    headers:requestHeaders,
    signal:AbortSignal.timeout(120000)
  });
  if (!upstream.ok && upstream.status !== 206) return new Response(`source fetch failed: ${upstream.status}`,{status:502});

  const h = new Headers();
  h.set('content-type','application/pdf');
  h.set('content-disposition',`inline; filename="${doc.name.replace(/[^A-Za-z0-9._-]+/g,'_')}"`);
  h.set('cache-control','private, no-store, max-age=0');
  h.set('accept-ranges',upstream.headers.get('accept-ranges') ?? 'bytes');
  for (const key of ['content-length','content-range','etag','last-modified']) {
    const value = upstream.headers.get(key);
    if (value) h.set(key,value);
  }
  return new Response(req.method === 'HEAD' ? null : upstream.body,{status:upstream.status,headers:h});
});
