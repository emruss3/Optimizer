import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const dbUrl=Deno.env.get('SUPABASE_DB_URL');if(!dbUrl)throw new Error('SUPABASE_DB_URL unavailable');
const sql=postgres(dbUrl,{max:1,prepare:false,connect_timeout:15,idle_timeout:10});
const UUID=/^[0-9a-f-]{36}$/i;
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}});
function direct(source:string){const u=new URL(source);if(u.hostname.includes('dropbox.com'))u.searchParams.set('dl','1');return u.toString();}
async function hash(t:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try{
    const q=await req.json() as {artifact_id?:string;token?:string;page?:number};
    if(!q.artifact_id||!q.token||!UUID.test(q.artifact_id)||!UUID.test(q.token)||!Number.isInteger(q.page)||Number(q.page)<1)return reply({error:'bad args'},400);
    const rows=await sql<{source_url:string;slug:string}[]>`select a.source_url,d.slug from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id where a.id=${q.artifact_id}::uuid and a.metadata->>'viewer_token'=${q.token} and (a.metadata->>'viewer_expires_at')::timestamptz>now() and d.metadata->>'source_confidentiality'='private_project_documents' and a.file_format='pdf'`;
    const j=rows[0];if(!j)return reply({error:'unauthorized'},401);
    const r=await fetch(direct(j.source_url),{redirect:'follow',headers:{accept:'application/pdf,application/octet-stream','user-agent':'Parcelmap-PDF-Slice/1.0'},signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw new Error(`download failed ${r.status}`);
    const original=new Uint8Array(await r.arrayBuffer());
    const src=await PDFDocument.load(original,{ignoreEncryption:true,updateMetadata:false,throwOnInvalidObject:false});
    if(Number(q.page)>src.getPageCount())throw new Error(`page>${src.getPageCount()}`);
    const dst=await PDFDocument.create();
    const [copied]=await dst.copyPages(src,[Number(q.page)-1]);dst.addPage(copied);
    const one=new Uint8Array(await dst.save({useObjectStreams:false,addDefaultPage:false,objectsPerTick:100}));
    const doc=await pdfjs.getDocument({data:one,disableWorker:true,useSystemFonts:true,isEvalSupported:false}).promise;
    const page=await doc.getPage(1),v=page.getViewport({scale:1}),tc=await page.getTextContent({includeMarkedContent:false});
    const text=(tc.items as Array<{str?:string}>).map(x=>x.str??'').filter(Boolean).join(' ').replace(/\s+/g,' ').trim(),sha=await hash(text),meta={source_page:Number(q.page),document_page_count:src.getPageCount(),slice_byte_size:one.byteLength,source_mode:'pdf_lib_single_page_slice',item_count:tc.items.length};
    await sql`insert into training.pdf_page_extract(artifact_id,page_number,page_width_pt,page_height_pt,text_content,text_sha256,parser_version,quality_status,extraction_metadata,extracted_at,updated_at) values(${q.artifact_id}::uuid,${Number(q.page)},${v.width},${v.height},${text},${sha},'pdf_slice_text_v1',${text?'extracted':'empty'},${sql.json(meta)}::jsonb,now(),now()) on conflict(artifact_id,page_number) do update set page_width_pt=excluded.page_width_pt,page_height_pt=excluded.page_height_pt,text_content=excluded.text_content,text_sha256=excluded.text_sha256,parser_version=excluded.parser_version,quality_status=excluded.quality_status,extraction_metadata=excluded.extraction_metadata,extracted_at=now(),updated_at=now()`;
    page.cleanup();await doc.destroy();
    return reply({ok:true,page:q.page,page_count:meta.document_page_count,slice_bytes:one.byteLength,text_chars:text.length,text_preview:text.slice(0,2500)});
  }catch(e){return reply({ok:false,error:e instanceof Error?e.message:String(e)},500);}
});
