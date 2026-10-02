import {test} from 'node:test';
import assert from 'node:assert/strict';
import {options,cleanup} from './cleanup-pending-photos.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://tyvzpuhxfwxrnkcpzxyg.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'};
const path='10000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/10000000-0000-0000-0000-000000000003.png';
test('rejects production, mismatched projects, unsafe ages and unbounded batches',()=>{
  for(const args of [[],['--project=local'],['--project=dev','--hours=0'],['--project=dev','--limit=101']])assert.throws(()=>options(args,env));
  assert.throws(()=>options(['--project=dev'],{...env,NEXT_PUBLIC_SUPABASE_URL:'https://vmutcradmodhiltuohys.supabase.co'}));
});
test('default dry run only reads pending candidates',async()=>{
  const calls=[];
  const result=await cleanup(options(['--project=dev'],env),async(url,init)=>{calls.push({url,method:init.method});return Response.json([{storage_path:path}]);});
  assert.equal(result.dryRun,true);assert.equal(result.removed,0);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');assert.match(calls[0].url,/status=eq.pending/);
});
test('preserves evidence and acknowledges it without deleting bytes',async()=>{
  const calls=[];
  const result=await cleanup(options(['--project=dev','--kind=deleted','--execute'],env),async(url)=>{calls.push(url);return Response.json(url.includes('get_experience_photo_cleanup')?[{storage_path:path}]:true);});
  assert.equal(result.preserved,1);assert.ok(calls.at(-1).includes('experience_ack_photo_cleanup'));assert.ok(!calls.some(url=>url.includes('/storage/')));
});
test('failed Storage deletion keeps the durable queue for a retry',async()=>{
  const calls=[];
  const result=await cleanup(options(['--project=dev','--execute'],env),async(url)=>{calls.push(url);return url.includes('/storage/')?new Response('',{status:503}):Response.json(url.includes('cleanup_pending_photos')?[path]:url.includes('moderation_photo')?false:true);});
  assert.equal(result.retry,1);assert.ok(!calls.some(url=>url.includes('experience_ack_photo_cleanup')));
});
