import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function options(args,env,now=new Date()) {
  const values={project:null,kind:'pending',hours:24,limit:100,execute:false};
  for(const arg of args) {
    if(arg==='--execute') {values.execute=true;continue;}
    const match=/^--(project|kind|hours|limit)=(.+)$/.exec(arg);
    if(!match) throw new Error('Use --project=dev|local [--kind=pending|deleted] [--hours=24] [--limit=100] [--execute]');
    values[match[1]]=match[1]==='hours'||match[1]==='limit' ? Number(match[2]) : match[2];
  }
  if(!['dev','local'].includes(values.project)||!['pending','deleted'].includes(values.kind)||!Number.isInteger(values.hours)||values.hours<1||!Number.isInteger(values.limit)||values.limit<1||values.limit>100) throw new Error('Explicit dev/local project, age >=1 hour and limit 1..100 required');
  const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const local=['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:';
  const dev=url.hostname==='tyvzpuhxfwxrnkcpzxyg.supabase.co'&&url.protocol==='https:';
  if((values.project==='local'&&!local)||(values.project==='dev'&&!dev)||!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Project does not match service environment');
  return {...values,url:url.origin,key:env.SUPABASE_SERVICE_ROLE_KEY,before:new Date(now.getTime()-values.hours*3600000).toISOString()};
}

export async function cleanup(config,request=fetch) {
  const headers={apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'};
  async function call(path,body) {
    const response=await request(`${config.url}${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok) throw new Error(`Cleanup request failed (${response.status})`);
    return response.status===204?null:response.json();
  }
  const rpc=(name,body)=>call(`/rest/v1/rpc/${name}`,body);
  let paths;
  if(config.kind==='pending') {
    if(config.execute) paths=await rpc('experience_cleanup_pending_photos',{p_before:config.before,p_limit:config.limit});
    else {
      const query=new URLSearchParams({select:'storage_path',status:'eq.pending',created_at:`lt.${config.before}`,order:'created_at.asc,id.asc',limit:String(config.limit)});
      paths=(await call(`/rest/v1/experience_photos?${query}`)).map(row=>row.storage_path);
    }
  } else paths=(await rpc('get_experience_photo_cleanup',{p_before:config.before,p_limit:config.limit})).map(row=>row.storage_path);
  if(!Array.isArray(paths)||paths.some(path=>typeof path!=='string'||!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(path))) throw new Error('Invalid cleanup paths');
  const result={candidates:paths.length,removed:0,preserved:0,retry:0,dryRun:!config.execute};
  if(!config.execute) return result;
  for(const path of paths) {
    try {
      if(await rpc('experience_photo_cleanup_candidate',{p_path:path})!==true) {result.retry++;continue;}
      const evidence=await rpc('moderation_photo_is_evidence',{p_path:path});
      if(typeof evidence!=='boolean') throw new Error('Unknown evidence state');
      if(!evidence) {
        const response=await request(`${config.url}/storage/v1/object/experience-photos`,{method:'DELETE',headers,body:JSON.stringify({prefixes:[path]})});
        if(!response.ok) throw new Error('Storage removal failed');
      }
      await rpc('experience_ack_photo_cleanup',{p_path:path});
      if(evidence)result.preserved++;else result.removed++;
    } catch {result.retry++;}
  }
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(existsSync('.env.local'))process.loadEnvFile('.env.local');
    const result=await cleanup(options(process.argv.slice(2),process.env));
    console.log(JSON.stringify(result));
    if(result.retry)process.exitCode=1;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
