import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
if (!dbUrl) throw new Error("SUPABASE_DB_URL is not configured");
const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 20, idle_timeout: 15 });
const M2_TO_SQFT = 10.7639104167;
const M_TO_FT = 3.280839895;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "content-type": "application/json; charset=utf-8" };

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown, fallback = "") => typeof v === "string" ? v : fallback;
const bool = (v: unknown) => v === true || v === "true";
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};
async function sha256(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

type Job = {
  job_id: string; artifact_id: string; artifact_name: string; source_url: string;
  split: string; file_format: string; artifact_metadata: Record<string, unknown> | null;
  dataset_id: string; dataset_slug: string; training_use_status: string;
  commercial_use_allowed: boolean | null; license_fee_required: boolean;
  model_training_allowed: boolean | null;
};
type Vertex = [number, number, number];
type Parsed = {
  sourceRecordId: string; buildingType: string; subtype: string | null;
  gross: number | null; net: number | null; efficiency: number | null;
  spaces: Array<Record<string, unknown>>; elements: Array<Record<string, unknown>>;
  entityCounts: Record<string, number>; program: Record<string, unknown>;
  core: Record<string, unknown>; metadata: Record<string, unknown>;
  quality: "accepted" | "quarantined"; qualityScore: number; notes: string[];
  approved: boolean; parserVersion: string; sourceFormat: string;
};

function objectBlocks(text: string, prefix: string): string[] {
  const out: string[] = [];
  let block: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split("!-")[0].trim();
    if (!block.length && !clean.startsWith(prefix)) continue;
    block.push(line);
    if (clean.endsWith(";")) { out.push(block.join("\n")); block = []; }
  }
  return out;
}
function field(block: string, label: string): string | null {
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf("!-");
    if (i < 0) continue;
    const got = line.slice(i + 2).replace(/\{[^}]*\}/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (got !== want) continue;
    return line.slice(0, i).trim().replace(/[;,]\s*$/, "").trim() || null;
  }
  return null;
}
function handle(v: string | null): string | null {
  if (!v) return null;
  return (v.match(/\{([^}]+)\}/)?.[1] ?? v).trim().toLowerCase() || null;
}
function vertices(block: string): Vertex[] {
  const out: Array<{ i: number; v: Vertex }> = [];
  for (const line of block.split(/\r?\n/)) {
    const marker = line.indexOf("!-");
    if (marker < 0) continue;
    const label = line.slice(marker + 2).replace(/\{[^}]*\}/g, "").trim();
    const m = label.match(/^X,Y,Z Vertex\s+(\d+)/i);
    if (!m) continue;
    const xyz = line.slice(0, marker).trim().replace(/[;,]\s*$/, "").split(",").map(x => Number(x.trim()));
    if (xyz.length >= 3 && xyz.slice(0, 3).every(Number.isFinite)) out.push({ i: Number(m[1]), v: [xyz[0], xyz[1], xyz[2]] });
  }
  return out.sort((a, b) => a.i - b.i).map(x => x.v);
}
function area3d(v: Vertex[]): number {
  if (v.length < 3) return 0;
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.sqrt(x*x + y*y + z*z) / 2;
}
function dims(v: Vertex[]): { width: number | null; depth: number | null; height: number | null } {
  if (!v.length) return { width: null, depth: null, height: null };
  const xs=v.map(p=>p[0]), ys=v.map(p=>p[1]), zs=v.map(p=>p[2]);
  return { width: Math.max(...xs)-Math.min(...xs), depth: Math.max(...ys)-Math.min(...ys), height: Math.max(...zs)-Math.min(...zs) };
}
function classify(name: string): { type: string; group: string; privacy: string | null } {
  const t=name.toLowerCase(), has=(r:RegExp)=>r.test(t);
  if(has(/corridor|hallway|passage|circulation/)) return {type:"corridor",group:"circulation",privacy:"semi_public"};
  if(has(/lobby|reception|vestibule|waiting|entrance/)) return {type:"lobby",group:"public",privacy:"public"};
  if(has(/stair/)) return {type:"stair",group:"core",privacy:"service"};
  if(has(/elev/)) return {type:"elevator",group:"core",privacy:"service"};
  if(has(/toilet|restroom|bath|locker|shower/)) return {type:"restroom",group:"service",privacy:"service"};
  if(has(/mechanical|mech_|boiler|electrical|utility|hvac|plant|equipment/)) return {type:"mechanical",group:"service",privacy:"restricted"};
  if(has(/loading|dock|receiv/)) return {type:"loading",group:"service",privacy:"restricted"};
  if(has(/storage|stock|warehouse/)) return {type:"storage",group:"storage",privacy:"service"};
  if(has(/kitchen|food.?prep/)) return {type:"kitchen",group:"food_service",privacy:"service"};
  if(has(/dining|cafe|restaurant|banquet|cafeteria/)) return {type:"dining",group:"food_service",privacy:"public"};
  if(has(/classroom|library|gymnasium|auditorium|multipurpose|school/)) return {type:"education",group:"education",privacy:"semi_public"};
  if(has(/patient|exam|operating|surgery|nurse|clinic|medical|recovery|icu/)) return {type:"clinical",group:"healthcare",privacy:"restricted"};
  if(has(/laboratory|\blab\b/)) return {type:"laboratory",group:"research",privacy:"restricted"};
  if(has(/guest|guestroom|room_\d/)) return {type:"guestroom",group:"lodging",privacy:"private"};
  if(has(/retail|sales|cashier|shop/)) return {type:"retail",group:"sales",privacy:"public"};
  if(has(/conference|meeting|openoffice|closedoffice|office/)) return {type:"office",group:"work",privacy:"semi_public"};
  if(has(/apartment|residential|dwelling|bedroom|living|unit_/)) return {type:"residential",group:"residential",privacy:"private"};
  if(has(/data.?center|server|ite/)) return {type:"data_center",group:"technical",privacy:"restricted"};
  if(has(/parking|garage/)) return {type:"parking",group:"parking",privacy:"semi_public"};
  if(has(/attic|plenum|crawl/)) return {type:"service_void",group:"service",privacy:"restricted"};
  return {type:"other",group:"other",privacy:null};
}

function parseOsm(job: Job, text: string): Parsed {
  const meta=rec(job.artifact_metadata), counts:Record<string,number>={};
  for(const m of text.matchAll(/^\s*(OS:[A-Za-z0-9:]+)\s*[,;]/gm)) counts[m[1]]=(counts[m[1]]??0)+1;
  const spaceBlocks=objectBlocks(text,"OS:Space,");
  const surfaceBlocks=objectBlocks(text,"OS:Surface,");
  const subBlocks=objectBlocks(text,"OS:SubSurface,");
  const surfaces=new Map<string,{space:string|null,type:string,verts:Vertex[],area:number,outside:string|null}>();
  for(const b of surfaceBlocks){ const h=handle(field(b,"Handle")); if(!h)continue; const vv=vertices(b); surfaces.set(h,{space:handle(field(b,"Space Name")),type:field(b,"Surface Type")??"Other",verts:vv,area:area3d(vv),outside:field(b,"Outside Boundary Condition")}); }
  const bySpace=new Map<string,Array<{space:string|null,type:string,verts:Vertex[],area:number,outside:string|null}>>();
  for(const s of surfaces.values()){ if(!s.space)continue; const a=bySpace.get(s.space)??[]; a.push(s); bySpace.set(s.space,a); }
  const spaces:Array<Record<string,unknown>>=[], groups:Record<string,number>={}; let gross=0,net=0,measured=0;
  for(const b of spaceBlocks){
    const h=handle(field(b,"Handle")); if(!h)continue;
    const name=field(b,"Name")??h, c=classify(name), ss=bySpace.get(h)??[], floors=ss.filter(s=>s.type.toLowerCase()==="floor");
    const aM2=floors.reduce((n,s)=>n+s.area,0), allv=ss.flatMap(s=>s.verts), fv=floors.flatMap(s=>s.verts), d=dims(fv.length?fv:allv);
    const mult=Math.max(1,Number(name.match(/mult(?:iplier)?[_ -]?(\d+)/i)?.[1]??1)); const area=aM2>0?aM2*M2_TO_SQFT:null, effective=(area??0)*mult;
    if(area!==null)measured++; gross+=effective; if(!["circulation","core","service"].includes(c.group))net+=effective; groups[c.group]=(groups[c.group]??0)+mult;
    spaces.push({source_space_id:h,space_type:c.type,space_subtype:name,function_group:c.group,area_sqft:area===null?null:Math.round(area*100)/100,width_ft:d.width===null?null:Math.round(d.width*M_TO_FT*100)/100,depth_ft:d.depth===null?null:Math.round(d.depth*M_TO_FT*100)/100,clear_height_ft:d.height===null?null:Math.round(d.height*M_TO_FT*100)/100,capacity:null,public_private:c.privacy,conditioned:Boolean(field(b,"Thermal Zone Name")),attributes:{source_name:name,multiplier:mult,effective_area_sqft:Math.round(effective*100)/100,story_handle:handle(field(b,"Building Story Name")),space_type_handle:handle(field(b,"Space Type Name")),thermal_zone_handle:handle(field(b,"Thermal Zone Name"))}});
  }
  const elementMap=new Map<string,{element_type:string,subtype:string|null,quantity:number,attributes:Record<string,unknown>}>();
  const add=(et:string,st:string|null,q:number,area=0)=>{const k=`${et}|${st??""}`,e=elementMap.get(k)??{element_type:et,subtype:st,quantity:0,attributes:{}};e.quantity+=q;if(area)e.attributes.area_sqft=Math.round(((num(e.attributes.area_sqft)??0)+area)*100)/100;elementMap.set(k,e);};
  for(const s of surfaces.values()) add(s.type.toLowerCase()==="wall"?"wall":"other",s.type,1,s.area*M2_TO_SQFT);
  for(const b of subBlocks){const st=field(b,"Sub Surface Type")??"Other",a=area3d(vertices(b))*M2_TO_SQFT,et=st.toLowerCase().includes("window")?"window":st.toLowerCase().includes("door")?"door":"other";add(et,st,1,a);}
  for(const s of spaces){if(s.space_type==="stair")add("stair","space_inferred",1);if(s.space_type==="elevator")add("elevator","space_inferred",1);if(s.space_type==="mechanical")add("mep_room","space_inferred",1);if(s.space_type==="loading")add("loading_dock","space_inferred",1);}
  const ratio=spaces.length?measured/spaces.length:0, score=Math.min(1,(spaces.length?0.3:0)+ratio*.3+(gross>100?0.2:0)+(subBlocks.length?0.1:0)+Math.min(.1,Object.keys(groups).length*.02));
  const notes:string[]=[];if(!spaces.length)notes.push("no_spaces");if(ratio<.5)notes.push("less_than_half_spaces_have_measured_floor_area");if(gross<=100)notes.push("gross_floor_area_missing_or_too_small");
  const accepted=spaces.length>0&&ratio>=.5&&gross>100&&score>=.65, semantic=bool(meta.semantic_only), efficiency=gross>0?Math.max(0,Math.min(100,net/gross*100)):null;
  return {sourceRecordId:str(meta.source_record_id,job.artifact_name.replace(/\.[^.]+$/,"")),buildingType:str(meta.building_type,"other"),subtype:str(meta.subtype)||null,gross:Math.round(gross*100)/100,net:Math.round(net*100)/100,efficiency:efficiency===null?null:Math.round(efficiency*100)/100,spaces,elements:[...elementMap.values()],entityCounts:counts,program:{function_group_counts:groups,represented_space_count:spaces.length,measured_space_ratio:Math.round(ratio*1000)/1000,surface_count:surfaceBlocks.length,subsurface_count:subBlocks.length,multipliers_expanded_in_gfa:true},core:{corridor_spaces:spaces.filter(s=>s.space_type==="corridor").length,stair_spaces:spaces.filter(s=>s.space_type==="stair").length,elevator_spaces:spaces.filter(s=>s.space_type==="elevator").length,lobby_spaces:spaces.filter(s=>s.space_type==="lobby").length,service_spaces:spaces.filter(s=>s.function_group==="service").length},metadata:{country_code:meta.country_code??null,us_archetype:bool(meta.us_archetype),semantic_only:semantic,geometry_status:"space_area_and_dimensions_parsed; polygons_not_yet_persisted",area_method:"sum_of_OS_Surface_floor_polygons"},quality:accepted?"accepted":"quarantined",qualityScore:Math.round(score*1000)/1000,notes,approved:accepted&&!semantic,parserVersion:"openstudio_osm_cleaner_v1",sourceFormat:"OpenStudio OSM"};
}
function ifcCounts(text:string):Record<string,number>{const c:Record<string,number>={};for(const m of text.matchAll(/#\d+\s*=\s*(IFC[A-Z0-9_]+)\s*\(/g))c[m[1]]=(c[m[1]]??0)+1;return c;}
function parseIfc(job:Job,text:string):Parsed{
  const meta=rec(job.artifact_metadata),c=ifcCounts(text),schema=text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1]??null,total=Object.values(c).reduce((a,b)=>a+b,0),ok=Boolean(schema)&&total>=20;
  const map:Array<[string,string,string]>= [["IFCWALL","wall","IfcWall"],["IFCWALLSTANDARDCASE","wall","IfcWallStandardCase"],["IFCDOOR","door","IfcDoor"],["IFCWINDOW","window","IfcWindow"],["IFCCOLUMN","column","IfcColumn"],["IFCSTAIR","stair","IfcStair"],["IFCTRANSPORTELEMENT","elevator","IfcTransportElement"],["IFCSLAB","other","IfcSlab"],["IFCDISTRIBUTIONELEMENT","other","IfcDistributionElement"]];
  const elements=map.filter(([k])=>(c[k]??0)>0).map(([k,t,s])=>({element_type:t,subtype:s,quantity:c[k],attributes:{}}));
  return {sourceRecordId:str(meta.source_record_id,job.artifact_name.replace(/\.[^.]+$/,"")),buildingType:str(meta.building_type,"parser_test_scene"),subtype:str(meta.subtype)||null,gross:null,net:null,efficiency:null,spaces:[],elements,entityCounts:c,program:{discipline:meta.discipline??null,ifc_schema:schema,entity_total:total,semantic_only:true},core:{building_count:c.IFCBUILDING??0,storey_count:c.IFCBUILDINGSTOREY??0,space_count:c.IFCSPACE??0},metadata:{semantic_only:true,us_archetype:false,precedent_weight:0,geometry_status:"entity_inventory_only"},quality:ok?"accepted":"quarantined",qualityScore:ok?.7:.3,notes:["semantic_only_no_reliable_floor_polygon_normalization"],approved:false,parserVersion:"ifc_semantic_cleaner_v1",sourceFormat:"IFC STEP"};
}
async function persist(job:Job,p:Parsed,sourceSha:string,byteSize:number):Promise<Record<string,unknown>>{
  const payload={source_format:p.sourceFormat,parser_version:p.parserVersion,source_record_id:p.sourceRecordId,building_type:p.buildingType,subtype:p.subtype,source_url:job.source_url,source_sha256:sourceSha,quality:{status:p.quality,score:p.qualityScore,notes:p.notes},summary:{gross_floor_area_sqft:p.gross,net_usable_area_sqft:p.net,efficiency_pct:p.efficiency,space_count:p.spaces.length,element_group_count:p.elements.length},entity_counts:p.entityCounts,program_metrics:p.program,core_metrics:p.core,metadata:p.metadata,spaces:p.spaces.map(s=>({source_space_id:s.source_space_id,space_type:s.space_type,function_group:s.function_group,area_sqft:s.area_sqft,multiplier:rec(s.attributes).multiplier??1}))};
  const payloadSha=await sha256(JSON.stringify(payload)),notes=p.notes.join(", ")||null;
  await sql`insert into training.raw_documents(dataset_id,artifact_id,source_record_id,record_index,split,payload,payload_sha256,quality_status,approved_for_training,normalized_at,quality_notes) values(${job.dataset_id}::uuid,${job.artifact_id}::uuid,${p.sourceRecordId},0,${job.split},${sql.json(payload)}::jsonb,${payloadSha},${p.quality},${p.approved},now(),${notes}) on conflict(artifact_id,record_index) do update set source_record_id=excluded.source_record_id,split=excluded.split,payload=excluded.payload,payload_sha256=excluded.payload_sha256,quality_status=excluded.quality_status,approved_for_training=excluded.approved_for_training,normalized_at=excluded.normalized_at,quality_notes=excluded.quality_notes`;
  const rows=await sql<{id:string}[]>`insert into training.building_interiors(dataset_id,source_record_id,building_type,subtype,floor_no,gross_floor_area_sqft,net_usable_area_sqft,efficiency_pct,structural_grid,core_metrics,program_metrics,source_file_url,metadata,approved_for_training,updated_at) values(${job.dataset_id}::uuid,${p.sourceRecordId},${p.buildingType},${p.subtype},0,${p.gross},${p.net},${p.efficiency},'{}'::jsonb,${sql.json(p.core)}::jsonb,${sql.json(p.program)}::jsonb,${job.source_url},${sql.json({...p.metadata,source_sha256:sourceSha,parser_version:p.parserVersion,quality_score:p.qualityScore,quality_notes:p.notes})}::jsonb,${p.approved},now()) on conflict(dataset_id,source_record_id,floor_no) do update set building_type=excluded.building_type,subtype=excluded.subtype,gross_floor_area_sqft=excluded.gross_floor_area_sqft,net_usable_area_sqft=excluded.net_usable_area_sqft,efficiency_pct=excluded.efficiency_pct,core_metrics=excluded.core_metrics,program_metrics=excluded.program_metrics,source_file_url=excluded.source_file_url,metadata=excluded.metadata,approved_for_training=excluded.approved_for_training,updated_at=now() returning id::text`;
  const id=rows[0]?.id;if(!id)throw new Error("normalization insert failed");
  await sql`delete from training.interior_connections where interior_id=${id}::uuid`;
  await sql`delete from training.interior_spaces where interior_id=${id}::uuid`;
  await sql`delete from training.interior_elements where interior_id=${id}::uuid`;
  if(p.spaces.length)await sql`with x as(select * from jsonb_to_recordset(${sql.json(p.spaces)}::jsonb) as r(source_space_id text,space_type text,space_subtype text,function_group text,area_sqft numeric,width_ft numeric,depth_ft numeric,clear_height_ft numeric,capacity integer,public_private text,conditioned boolean,attributes jsonb)) insert into training.interior_spaces(interior_id,source_space_id,space_type,space_subtype,function_group,area_sqft,width_ft,depth_ft,clear_height_ft,capacity,public_private,conditioned,attributes) select ${id}::uuid,source_space_id,space_type,space_subtype,function_group,area_sqft,width_ft,depth_ft,clear_height_ft,capacity,public_private,conditioned,coalesce(attributes,'{}'::jsonb) from x`;
  if(p.elements.length)await sql`with x as(select * from jsonb_to_recordset(${sql.json(p.elements)}::jsonb) as r(element_type text,subtype text,quantity numeric,attributes jsonb)) insert into training.interior_elements(interior_id,element_type,subtype,quantity,attributes) select ${id}::uuid,element_type,subtype,quantity,coalesce(attributes,'{}'::jsonb) from x`;
  return {interiorId:id,sourceRecordId:p.sourceRecordId,qualityStatus:p.quality,qualityScore:p.qualityScore,approvedForTraining:p.approved,spaces:p.spaces.length,elements:p.elements.length,grossFloorAreaSqft:p.gross,sourceSha256:sourceSha,byteSize,parserVersion:p.parserVersion};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply({error:"POST required"},405);let jobId:string|undefined;
  try{
    const body=await req.json() as {job_id?:string;nonce?:string};jobId=body.job_id;const nonce=body.nonce;
    if(!jobId||!nonce||!UUID_RE.test(jobId)||!UUID_RE.test(nonce))return reply({error:"valid job_id and one-time nonce required"},400);
    const rows=await sql<Job[]>`with c as(update training.ingestion_jobs set status='running',attempts=attempts+1,started_at=now(),completed_at=null,last_error=null,updated_at=now(),invocation_nonce=gen_random_uuid() where id=${jobId}::uuid and invocation_nonce=${nonce}::uuid and status in('queued','failed','partial') and job_type='ifc_to_bim' returning id,artifact_id) select c.id::text job_id,a.id::text artifact_id,a.name artifact_name,a.source_url,a.split,a.file_format,a.metadata artifact_metadata,d.id::text dataset_id,d.slug dataset_slug,d.training_use_status,d.commercial_use_allowed,d.license_fee_required,d.model_training_allowed from c join training.dataset_artifacts a on a.id=c.artifact_id join training.dataset_registry d on d.id=a.dataset_id`;
    const job=rows[0];if(!job)return reply({error:"invalid, expired, or unavailable ingestion capability"},401);
    if(!(job.training_use_status==="approved"&&job.commercial_use_allowed===true&&job.license_fee_required===false&&job.model_training_allowed===true))throw new Error(`dataset ${job.dataset_slug} failed license gate`);
    await sql`update training.dataset_artifacts set status='ingesting',updated_at=now() where id=${job.artifact_id}::uuid`;
    const r=await fetch(job.source_url,{redirect:"follow",headers:{accept:"text/plain,application/octet-stream","user-agent":"Parcelmap-Model-Ingestor/1.0"}});if(!r.ok)throw new Error(`source download failed: ${r.status} ${r.statusText}`);
    const bytes=new Uint8Array(await r.arrayBuffer()),text=new TextDecoder().decode(bytes),sourceSha=await sha256(bytes),format=job.file_format.toLowerCase();
    const parsed=format==="osm"?parseOsm(job,text):format==="ifc"?parseIfc(job,text):(()=>{throw new Error(`unsupported format ${job.file_format}`)})();
    const result=await persist(job,parsed,sourceSha,bytes.byteLength),artifactStatus=parsed.quality==="quarantined"?"partial":"ingested";
    await sql`update training.ingestion_jobs set status='completed',records_seen=1,records_written=1,result=${sql.json(result)}::jsonb,completed_at=now(),updated_at=now() where id=${jobId}::uuid`;
    await sql`update training.dataset_artifacts set status=${artifactStatus},retrieved_at=coalesce(retrieved_at,now()),updated_at=now(),checksum_algorithm='sha256',checksum_value=${sourceSha},byte_size=${bytes.byteLength},metadata=metadata||${sql.json({lastJobId:jobId,parserVersion:parsed.parserVersion,qualityStatus:parsed.quality,qualityScore:parsed.qualityScore})}::jsonb where id=${job.artifact_id}::uuid`;
    return reply({ok:true,job_id:jobId,artifact:job.artifact_name,artifactStatus,result});
  }catch(e){const message=e instanceof Error?e.message:String(e);console.error("training-model-ingest failed",{jobId,message});if(jobId&&UUID_RE.test(jobId))await sql`update training.ingestion_jobs set status='failed',last_error=${message},completed_at=now(),updated_at=now() where id=${jobId}::uuid`.catch(()=>undefined);return reply({ok:false,job_id:jobId,error:message},500);}
});
