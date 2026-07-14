import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const dbUrl=Deno.env.get('SUPABASE_DB_URL'),base=Deno.env.get('SUPABASE_URL');
if(!dbUrl||!base)throw new Error('env unavailable');
const sql=postgres(dbUrl,{max:1,prepare:false}),UUID=/^[0-9a-f-]{36}$/i,CHUNK=65536;
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}});
async function range(url:string,b:number,e:number){const r=await fetch(url,{headers:{range:`bytes=${b}-${e-1}`},signal:AbortSignal.timeout(60000)});if(r.status!==206&&r.status!==200)throw new Error(`range failed ${r.status}`);const a=new Uint8Array(await r.arrayBuffer());if(a.length!==e-b)throw new Error(`range mismatch ${b}:${a.length}/${e-b}`);return {a,cr:r.headers.get('content-range')};}
async function hash(t:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
class R extends pdfjs.PDFDataRangeTransport{u:string;constructor(n:number,a:Uint8Array,u:string){super(n,a);this.u=u;}requestDataRange(b:number,e:number){void range(this.u,b,e).then(x=>this.onDataRange(b,x.a)).catch(err=>this.abort(err));}}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try{
    const q=await req.json() as {artifact_id?:string;token?:string;page?:number};
    if(!q.artifact_id||!q.token||!UUID.test(q.artifact_id)||!UUID.test(q.token)||!Number.isInteger(q.page)||Number(q.page)<1)return reply({error:'bad args'},400);
    const rows=await sql<{slug:string;byte_size:string|null}[]>`select d.slug,a.byte_size::text from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id where a.id=${q.artifact_id}::uuid and a.metadata->>'viewer_token'=${q.token} and (a.metadata->>'viewer_expires_at')::timestamptz>now() and d.metadata->>'source_confidentiality'='private_project_documents'`;
    const j=rows[0];if(!j)return reply({error:'unauthorized'},401);
    const u=`${base}/functions/v1/private-pdf-proxy?artifact_id=${encodeURIComponent(q.artifact_id)}&token=${encodeURIComponent(q.token)}`;
    let n=j.byte_size?Number(j.byte_size):0;
    const first=await range(u,0,n?Math.min(CHUNK,n):CHUNK);
    if(!n){n=Number(first.cr?.match(/\/(\d+)$/)?.[1]??0);if(!n)throw new Error('unknown length');await sql`update training.dataset_artifacts set byte_size=${String(n)}::bigint where id=${q.artifact_id}::uuid`;}
    const tr=new R(n,first.a,u);
    const doc=await pdfjs.getDocument({range:tr,length:n,disableWorker:true,disableAutoFetch:true,disableStream:true,isEvalSupported:false,useSystemFonts:true}).promise;
    if(Number(q.page)>doc.numPages)throw new Error(`page>${doc.numPages}`);
    const p=await doc.getPage(Number(q.page)),v=p.getViewport({scale:1}),tc=await p.getTextContent({includeMarkedContent:false});
    const text=(tc.items as Array<{str?:string}>).map(x=>x.str??'').filter(Boolean).join(' ').replace(/\s+/g,' ').trim(),sha=await hash(text),meta={document_page_count:doc.numPages,item_count:tc.items.length,source_mode:'custom_range',known_length:n};
    await sql`insert into training.pdf_page_extract(artifact_id,page_number,page_width_pt,page_height_pt,text_content,text_sha256,parser_version,quality_status,extraction_metadata,extracted_at,updated_at) values(${q.artifact_id}::uuid,${Number(q.page)},${v.width},${v.height},${text},${sha},'pdfjs_page_text_v5',${text?'extracted':'empty'},${sql.json(meta)}::jsonb,now(),now()) on conflict(artifact_id,page_number) do update set page_width_pt=excluded.page_width_pt,page_height_pt=excluded.page_height_pt,text_content=excluded.text_content,text_sha256=excluded.text_sha256,parser_version=excluded.parser_version,quality_status=excluded.quality_status,extraction_metadata=excluded.extraction_metadata,extracted_at=now(),updated_at=now()`;
    p.cleanup();await doc.destroy();
    return reply({ok:true,page:q.page,page_count:meta.document_page_count,text_chars:text.length,text_preview:text.slice(0,1800)});
  }catch(e){return reply({ok:false,error:e instanceof Error?e.message:String(e)},500);}
});
