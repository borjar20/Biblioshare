import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

export async function verifyExperienceConcurrency(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const sql = async (query) => (await run('docker', ['exec', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query])).stdout.trim();
  const owner = randomUUID();
  let root;
  try {
    await sql(`insert into auth.users(id) values('${owner}');`);
    root = JSON.parse((await sql(`select set_config('request.jwt.claim.sub','${owner}',false); select public.experience_create('{"title":"[TEST] concurrent","state":"planned","kind":"other"}');`)).split('\n').at(-1)).id;
    const results = await Promise.allSettled(['A', 'B'].map((title) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true); select public.experience_update('${root}',0,'{"title":"[TEST] ${title}","shape":"single","state":"planned","audience":"private"}'); commit;`)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.match(rejected.reason.stderr, /conflict/);
    assert.equal(await sql(`select revision from public.experiences where id='${root}';`), '1');
    assert.equal(await sql(`select count(*) from public.experience_moments where experience_id='${root}';`), '1');
    console.log('PASS: two concurrent experience edits yielded one commit and one conflict.');
  } finally {
    await sql(`delete from auth.users where id='${owner}';`);
    if (root) assert.equal(await sql(`select count(*) from public.experiences where id='${root}';`), '0');
  }
}
