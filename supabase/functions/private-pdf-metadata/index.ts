import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const dbUrl=Deno.env.get('SUPABASE_DB_URL');
if(!dbUrl) throw new Error('SUPABASE_DB_URL unavailable');
const sql=postgres(dbUrl,{max:1,prepare:false,connect_timeout:15,idle_timeout:10});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}});
function direct(source:string){const u=new URL(source);if(u.hostname.includes('dropbox.com'))u.searchParams.set('dl','1');return u.toString();}
async function sha(bytes:Uint8Array){const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST') return reply({error:'POST required'},405);
 try{
  const b=await req.json() as {artifact_id?:string;token?:string};
  if(!b.artifact_id||!b.token||!UUID.test(b.artifact_id)||!UUID.test(b.token)) return reply({error:'valid artifact_id and token required'},400);
  const rows=await sql<{source_url:string;name:string;slug:string}[]>`
    select a.source_url,a.name,d.slug from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id
    where a.id=${b.artifact_id}::uuid and a.metadata->>'viewer_token'=${b.token}
      and (a.metadata->>'viewer_expires_at')::timestamptz>now()
      and d.metadata->>'source_confidentiality'='private_project_documents' and a.file_format='pdf'`;
  const job=rows[0]; if(!job) return reply({error:'expired or unauthorized capability'},401);
  const r=await fetch(direct(job.source_url),{redirect:'follow',headers:{accept:'application/pdf,application/octet-stream','user-agent':'Parcelmap-Private-PDF-Metadata/2.0'},signal:AbortSignal.timeout(120000)});
  if(!r.ok) throw new Error(`download failed: ${r.status}`);
  const bytes=new Uint8Array(await r.arrayBuffer());
  const checksum=await sha(bytes);
  const pdf=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false,throwOnInvalidObject:false});
  const pages=pdf.getPages().map((p,i)=>{const s=p.getSize();return {page:i+1,width_pt:Math.round(s.width*100)/100,height_pt:Math.round(s.height*100)/100,rotation:p.getRotation().angle};});
  const info={title:pdf.getTitle()??null,author:pdf.getAuthor()??null,subject:pdf.getSubject()??null,keywords:pdf.getKeywords()??null,creator:pdf.getCreator()??null,producer:pdf.getProducer()??null,creation_date:pdf.getCreationDate()?.toISOString()??null,modification_date:pdf.getModificationDate()?.toISOString()??null};
  const meta={pdf_page_count:pages.length,pdf_page_sizes:pages,pdf_info:info,metadata_extraction_status:'completed',metadata_extraction_version:'pdf-lib-v2',source_sha256:checksum,metadata_extracted_at:new Date().toISOString()};
  await sql`update training.dataset_artifacts a set status='partial',byte_size=${String(bytes.byteLength)}::bigint,checksum_algorithm='sha256',checksum_value=${checksum},retrieved_at=now(),metadata=a.metadata||${sql.json(meta)}::jsonb,updated_at=now() where a.id=${b.artifact_id}::uuid`;
  return reply({ok:true,artifact_id:b.artifact_id,dataset_slug:job.slug,byte_size:bytes.byteLength,page_count:pages.length,source_sha256:checksum,pdf_info:info,page_sizes:pages.slice(0,20)});
 }catch(e){return reply({ok:false,error:e instanceof Error?e.message:String(e)},500);}
});
