import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from './bootstrap.mjs';
import { preparedLocalActivation } from './activate-local-celebrations.mjs';

// All connections are psql processes in the manifest-owned disposable container.
// Administrative setup/cleanup is separate from application calls under authenticated.
export async function verifyComparisonConcurrency(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const sql = async (query) => (await run('docker', [
    'exec', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-c', query,
  ], { timeout: 20000 })).stdout.trim();
  const users = Array.from({ length: 12 }, () => randomUUID());
  const array = (ids) => `array[${ids.map((id) => `'${id}'::uuid`).join(',')}]`;
  const session = `set local role authenticated; select set_config('request.jwt.claim.sub','${users[0]}',true);`;
  const tag = `cmp_${randomUUID().replaceAll('-', '')}`;
  const waiting = async (name, event) => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${name}' and ${event};`) === '1') return;
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.fail(`Did not observe ${name} ${event}`);
  };
  const compete = async (first, second) => {
    // First transaction demonstrably owns the parent lock before launching second.
    const a = sql(`set application_name='${tag}a'; begin; ${session} ${first}; select pg_sleep(3); commit;`);
    const aSettled = Promise.allSettled([a]);
    let bSettled;
    try {
      await waiting(`${tag}a`, "wait_event='PgSleep'");
      const b = sql(`set application_name='${tag}b'; begin; ${session} ${second}; commit;`);
      bSettled = Promise.allSettled([b]);
      await waiting(`${tag}b`, "wait_event_type='Lock'");
    } finally {
      // Never clean fixtures while a competing connection remains alive.
      // Do not return here: that would hide a failed lock observation.
      await Promise.all([aSettled, bSettled ?? Promise.resolve([])]);
    }
    const [ar, br] = await Promise.all([aSettled, bSettled]);
    assert.equal(ar[0].status, 'fulfilled', ar[0].reason?.stderr);
    assert.equal(br[0].status, 'rejected', 'both competing mutations committed');
    return br[0].reason.stderr;
  };
  try {
    await sql(`insert into auth.users(id) select unnest(${array(users)});
      insert into public.profiles(user_id,username,is_public) select u,'cmp_'||left(replace(u::text,'-',''),18),true from unnest(${array(users)}) u;
      insert into public.follows(follower_id,followee_id,status) select '${users[0]}',u,'accepted' from unnest(${array(users.slice(1))}) u;`);
    const create = await sql(`begin; ${session} select row_to_json(g) from public.save_comparison_group(null,'race',${array(users.slice(0,2))},null) g; commit;`);
    const group = JSON.parse(create.split('\n').find((line) => line.startsWith('{')));
    const save = `select public.save_comparison_group('${group.id}','race',${array(users.slice(0,2))},${group.revision})`;
    assert.match(await compete(save, save), /PT409/);
    assert.equal(await sql(`select count(*) from public.comparison_group_members where group_id='${group.id}';`), '2');
    console.log('PASS: comparison same-revision saves; observed second connection waiting; exactly one commits, loser PT409.');

    await sql(`begin; ${session} select public.save_comparison_group(id,'race',${array(users.slice(0,9))},revision) from public.comparison_groups where id='${group.id}'; commit;`);
    const insert = (id) => `insert into public.comparison_group_members(group_id,user_id,position) values ('${group.id}','${id}',9)`;
    assert.match(await compete(insert(users[9]), insert(users[10])), /22023|23505/);
    assert.equal(await sql(`select count(*) from public.comparison_group_members where group_id='${group.id}';`), '10');
    console.log('PASS: comparison concurrent direct inserts; observed parent-lock wait; exactly ten members committed.');
  } finally {
    await sql(`delete from auth.users where id=any(${array(users)});`);
    assert.equal(await sql(`select count(*) from public.comparison_groups where owner_id='${users[0]}';`), '0');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const workdir = resolve(process.env.SUPABASE_LOCAL_WORKDIR ?? join(repoRoot, '.superpowers/supabase-local'));
  preparedLocalActivation(workdir);
  const stamp = JSON.parse(readFileSync(join(workdir, 'bootstrap.json'), 'utf8'));
  await verifyComparisonConcurrency(stamp.projectId);
}
