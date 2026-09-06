import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

// Bounded fixture test, exclusively against the generated disposable container.
export async function verifyQuotaConcurrency(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const sql = async (query) => (await run('docker', [
    'exec', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At', '-c', query,
  ])).stdout.trim();
  const actor = randomUUID();
  try {
    await sql(`insert into auth.users(id) values ('${actor}');`);
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => sql(
      `select set_config('request.jwt.claim.sub', '${actor}', false); select public.consume_request_quota('social_posts');`,
    )));
    // allSettled waits for every connection before deleting the fixture, even
    // if one connection fails. No competing command outlives cleanup.
    for (const result of results) assert.equal(result.status, 'fulfilled');
    assert.equal(results.filter((result) => result.value.endsWith('\nt')).length, 20);
    assert.equal(results.filter((result) => result.value.endsWith('\nf')).length, 5);
    console.log('PASS: 25 concurrent connections admitted exactly 20 requests.');
  } finally {
    await sql(`delete from auth.users where id = '${actor}';`);
    assert.equal(await sql(`select count(*) from private.request_quotas where user_id = '${actor}';`), '0');
  }
}
