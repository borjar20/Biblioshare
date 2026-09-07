import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyCatalogReferenceConcurrency(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const sql = async (query) => (await run('docker', ['exec', `supabase_db_${projectId}`, 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { timeout: 15000 })).stdout.trim();
  const actor = randomUUID(), book = randomUUID();
  const label = `ref708_${randomUUID().replaceAll('-', '')}`;
  let pending = [];
  async function sleeping() {
    for (let i = 0; i < 30; i++) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event='PgSleep';`) === '1') return;
      await delay(50);
    }
    throw new Error('Fixture connection did not enter the controlled overlap');
  }
  try {
    await sql(`insert into auth.users(id) values('${actor}'); insert into public.books(id,title) values('${book}','[TEST #708] concurrency');`);
    const writer = sql(`set application_name='${label}'; begin;
      insert into public.notes(user_id,item_type,item_id,kind,body) values('${actor}','book','${book}','note','[TEST #708] writer');
      select pg_sleep(3); commit;`);
    pending = [writer];
    await sleeping();
    const deletion = sql(`delete from public.books where id='${book}';`);
    const results = await Promise.allSettled([writer, deletion]);
    pending = [];
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.match(results[1].reason.stderr, /catalog_item_has_references/);
    await sql(`delete from public.notes where user_id='${actor}';`);

    // Reverse the overlap: a reference writer must not follow a committed delete.
    const remover = sql(`set application_name='${label}'; begin;
      delete from public.books where id='${book}'; select pg_sleep(3); commit;`);
    pending = [remover];
    await sleeping();
    const insertion = sql(`insert into public.notes(user_id,item_type,item_id,kind,body)
      values('${actor}','book','${book}','note','[TEST #708] late writer');`);
    const reverse = await Promise.allSettled([remover, insertion]);
    pending = [];
    assert.equal(reverse[0].status, 'fulfilled');
    assert.equal(reverse[1].status, 'rejected');
    assert.match(reverse[1].reason.stderr, /catalog_item_not_found/);
    assert.equal(await sql(`select count(*) from public.notes where user_id='${actor}';`), '0');
    console.log('PASS #708: both concurrent insert/delete orders preserve catalog references.');
  } finally {
    await Promise.allSettled(pending);
    await sql(`delete from auth.users where id='${actor}'; delete from public.books where id='${book}';`);
  }
}
