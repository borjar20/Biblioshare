import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const quote = (value) => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const jsonLine = (output, prefix) => JSON.parse(output.split('\n').find((line) => line.startsWith(prefix)));

async function verifyReleaseWriteConcurrency(sql, person) {
  const editor = randomUUID();
  let editorial;
  let tmdb;
  const previousSource = jsonLine(await sql("select to_jsonb(s) from public.release_sync_state s where source='tmdb';"), '{');
  const input = { title: '[TEST] concurrent editorial snapshots', modality: 'book', market: 'ES', language: 'es',
    dateValue: null, datePrecision: 'unknown', status: 'draft', sourceName: 'Editorial', sourceUrl: 'https://example.invalid/original' };
  const sourceKey = `test-fence:${randomUUID()}`;
  const payload = { work_key: sourceKey, source_key: `${sourceKey}:cinema:ES`, item_type: 'movie', modality: 'cinema', market: 'ES', language: 'es',
    date_value: '2027-10-12', date_precision: 'day', status: 'published', title: '[TEST] concurrent source fencing', source_name: 'TMDB', source_url: 'https://example.invalid/tmdb', tmdb_id: 200 };
  const attemptA = '2026-10-06 09:00:00+00';
  const attemptB = '2026-10-06 10:00:00+00';
  let batch;
  let acquisition;
  try {
    await sql(`begin; insert into auth.users(id) values('${editor}');
      insert into public.profiles(user_id,username,role) values('${editor}','rle_${editor.replaceAll('-', '').slice(0, 15)}','admin'); commit;`);
    const original = jsonLine(await sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${editor}',true);
      select to_jsonb(r) from public.release_editorial_save(${quote(JSON.stringify(input))}::jsonb) r; commit;`), '{');
    editorial = original.id;
    const edits = await Promise.allSettled([
      { ...input, sourceUrl: 'https://example.invalid/first-editor' },
      { ...input, title: '[TEST] second editor title' },
    ].map((form) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${editor}',true);
      select * from public.release_editorial_save(${quote(JSON.stringify(form))}::jsonb,'${editorial}',${original.revision},${quote(original.updated_at)}::timestamptz); commit;`)));
    assert.equal(edits.filter((result) => result.status === 'fulfilled').length, 1, 'only one form with the same editorial token may commit');
    assert.match(edits.find((result) => result.status === 'rejected').reason.stderr, /release_edit_conflict/);
    const winner = jsonLine(await sql(`select to_jsonb(r) from public.cultural_releases r where id='${editorial}';`), '{');
    assert.equal(winner.revision, original.revision, 'metadata edits do not create an alert revision');
    assert.notEqual(winner.updated_at, original.updated_at);
    for (const form of [input, { ...input, status: 'published' }]) {
      await assert.rejects(sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${editor}',true);
        select * from public.release_editorial_save(${quote(JSON.stringify(form))}::jsonb,'${editorial}',${original.revision},${quote(original.updated_at)}::timestamptz); commit;`),
      (error) => /release_edit_conflict/.test(error.stderr), 'stale review/publication cannot restore old metadata');
    }
    const reviewInput = { ...input, title: winner.title, sourceUrl: winner.source_url };
    const reviewed = jsonLine(await sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${editor}',true);
      select to_jsonb(r) from public.release_editorial_save(${quote(JSON.stringify(reviewInput))}::jsonb,'${editorial}',${winner.revision},${quote(winner.updated_at)}::timestamptz) r; commit;`), '{');
    assert.equal(reviewed.source_url, winner.source_url);
    assert.equal(reviewed.revision, winner.revision);
    assert.notEqual(reviewed.updated_at, winner.updated_at);

    await sql(`update public.release_sync_state set last_attempt_at=${quote(attemptA)}::timestamptz,last_success_at=null where source='tmdb';`);
    const initial = jsonLine(await sql(`begin; set local role service_role;
      select to_jsonb(r) from public.release_upsert_tmdb(${quote(JSON.stringify([{ ...payload, checked_at: attemptA }]))}::jsonb,${quote(attemptA)}::timestamptz) r; commit;`), '{');
    tmdb = initial.id;
    await sql(`insert into public.release_subscriptions(user_id,release_id,baseline_revision) values('${person}','${tmdb}',${initial.revision});`);

    // Observe the actual blocking relationship; elapsed time alone is not proof of the fence.
    const batchApp = `release-batch-${randomUUID()}`;
    const acquisitionApp = `release-acquire-${randomUUID()}`;
    batch = sql(`begin; set local application_name=${quote(batchApp)}; set local role service_role;
      select * from public.release_upsert_tmdb(${quote(JSON.stringify([{ ...payload, checked_at: attemptA, date_value: '2027-10-13' }]))}::jsonb,${quote(attemptA)}::timestamptz);
      select pg_sleep(5); commit;`);
    batch.catch(() => {});
    let holding = false;
    for (let i = 0; i < 30 && !holding; i++) {
      holding = await sql(`select exists(select 1 from pg_stat_activity where application_name=${quote(batchApp)} and wait_event='PgSleep');`) === 't';
      if (!holding) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(holding, 'the batch must reach the controlled post-write gate');
    acquisition = sql(`begin; set local application_name=${quote(acquisitionApp)}; set local role service_role;
      update public.release_sync_state set last_attempt_at=${quote(attemptB)}::timestamptz where source='tmdb' and last_attempt_at=${quote(attemptA)}::timestamptz; commit;`);
    acquisition.catch(() => {});
    let blocked = false;
    for (let i = 0; i < 30 && !blocked; i++) {
      blocked = await sql(`select exists(select 1 from pg_stat_activity waiter join pg_stat_activity holder on holder.pid=any(pg_blocking_pids(waiter.pid))
        where waiter.application_name=${quote(acquisitionApp)} and holder.application_name=${quote(batchApp)} and waiter.wait_event_type='Lock');`) === 't';
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'a new acquisition must be blocked by the source batch row lock');
    const [batchResult, acquisitionResult] = await Promise.all([batch, acquisition]);
    assert.match(batchResult, /COMMIT/);
    assert.match(acquisitionResult, /UPDATE 1/);
    const newer = jsonLine(await sql(`begin; set local role service_role;
      select to_jsonb(r) from public.release_upsert_tmdb(${quote(JSON.stringify([{ ...payload, checked_at: attemptB, date_value: '2027-10-14' }]))}::jsonb,${quote(attemptB)}::timestamptz) r; commit;`), '{');
    const queueBefore = await sql(`select count(*) from public.release_deliveries where release_id='${tmdb}';`);
    await assert.rejects(sql(`begin; set local role service_role;
      select * from public.release_upsert_tmdb(${quote(JSON.stringify([{ ...payload, checked_at: attemptA }]))}::jsonb,${quote(attemptA)}::timestamptz); commit;`),
    (error) => /release_sync_attempt_conflict/.test(error.stderr));
    const afterStale = jsonLine(await sql(`select to_jsonb(r) from public.cultural_releases r where id='${tmdb}';`), '{');
    assert.equal(afterStale.date_value, newer.date_value);
    assert.equal(afterStale.revision, newer.revision);
    assert.equal(afterStale.checked_at, newer.checked_at);
    assert.equal(await sql(`select count(*) from public.release_deliveries where release_id='${tmdb}';`), queueBefore);
    assert.match(await sql(`update public.release_sync_state set last_success_at=${quote(attemptA)}::timestamptz where source='tmdb' and last_attempt_at=${quote(attemptA)}::timestamptz;`), /UPDATE 0/);
    assert.equal(await sql("select last_success_at is null from public.release_sync_state where source='tmdb';"), 't');
    console.log('PASS: concurrent editorial tokens, stale review/publication rejection, locked source acquisition and stale TMDB snapshot/success fencing.');
  } finally {
    // Let any controlled lock holder terminate before restoring only this test's state.
    await Promise.allSettled([batch, acquisition].filter(Boolean));
    await sql(`begin; delete from public.notifications where target_type='release' and target_id in (${quote(editorial)}::uuid,${quote(tmdb)}::uuid);
      delete from public.cultural_releases where id in (${quote(editorial)}::uuid,${quote(tmdb)}::uuid);
      delete from auth.users where id='${editor}';
      update public.release_sync_state set last_attempt_at=${quote(previousSource.last_attempt_at)}::timestamptz,
        last_success_at=${quote(previousSource.last_success_at)}::timestamptz,last_error=${quote(previousSource.last_error)} where source='tmdb'; commit;`);
  }
}

/** Real independent SQL sessions against this checkout's disposable DB only. */
export async function verifyReleaseConcurrency(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const sql = async (query) => (await run('docker', ['exec', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query])).stdout.trim();
  const person = randomUUID();
  const release = randomUUID();
  const tomorrow = "((now() at time zone 'Europe/Madrid')::date+1)::text";
  const consent = randomUUID();
  const delivery = randomUUID();
  let notification;
  try {
    await sql(`begin;
      insert into auth.users(id) values('${person}');
      insert into public.profiles(user_id,username,is_public) values('${person}','rlc_${person.replaceAll('-', '').slice(0, 15)}',true);
      insert into public.cultural_releases(id,work_key,source,source_key,item_type,modality,market,date_value,date_precision,status,title,source_name,source_url)
        values('${release}','editorial:${release}','editorial','${release}','book','book','ES',${tomorrow},'day','published','[TEST] concurrent release','Editorial','https://example.invalid/release');
      insert into public.release_subscriptions(user_id,release_id,consent_generation,baseline_revision) values('${person}','${release}','${consent}',1);
      insert into public.release_deliveries(id,release_id,user_id,release_revision,reason,consent_generation)
        values('${delivery}','${release}','${person}',1,'reminder','${consent}');
      commit;`);
    const claims = await Promise.all([0, 1].map(() => sql(`begin; set local role service_role;
      select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.claim_release_deliveries(500) c where c.id='${delivery}';
      select pg_sleep(0.15); commit;`)));
    const rows = claims.flatMap((output) => JSON.parse(output.split('\n').find((line) => line.startsWith('['))));
    assert.equal(rows.length, 1, 'two concurrent claims must reserve the delivery once');
    const claim = rows[0];
    assert.equal(await sql(`select attempts from public.release_deliveries where id='${delivery}';`), '1');

    // Losing the worker does not consume an unaccepted notice. Expired lease gets a fresh token.
    await sql(`update public.release_deliveries set lease_until=now()-interval '1 second' where id='${delivery}';`);
    const recovered = JSON.parse((await sql(`begin; set local role service_role;
      select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.claim_release_deliveries(500) c where c.id='${delivery}'; commit;`)).split('\n').find((line) => line.startsWith('[')))[0];
    assert.ok(recovered);
    assert.notEqual(recovered.claim_token, claim.claim_token);
    assert.equal(await sql(`begin; set local role service_role; select count(*) from public.accept_release_delivery('${delivery}','${claim.claim_token}'); commit;`), 'BEGIN\nSET\n0\nCOMMIT');

    const accepts = await Promise.all([0, 1].map(() => sql(`begin; set local role service_role;
      select count(*) from public.accept_release_delivery('${delivery}','${recovered.claim_token}'); commit;`)));
    assert.equal(accepts.map((output) => Number(output.split('\n').find((line) => /^\d+$/.test(line)))).reduce((a, b) => a + b, 0), 1,
      'two concurrent acceptances must insert one notification');
    assert.equal(await sql(`select count(*) from public.notifications where target_type='release' and target_id='${release}';`), '1');
    notification = await sql(`select notification_id from public.release_deliveries where id='${delivery}';`);
    assert.match(notification, /^[a-f0-9-]{36}$/);

    // A durable accepted ledger prevents resurrection after ordinary notification retention cleanup.
    await sql(`delete from public.notifications where id='${notification}';`);
    await sql(`begin; set local role service_role; select * from public.accept_release_delivery('${delivery}','${recovered.claim_token}'); commit;`);
    assert.equal(await sql(`select count(*) from public.notifications where target_id='${release}';`), '0');
    assert.equal(await sql(`select state from public.release_deliveries where id='${delivery}';`), 'accepted');

    // Retry then consent withdrawal: the old claim cannot accept or be requeued.
    await sql(`update public.cultural_releases set date_value=null,date_precision='unknown' where id='${release}';`);
    const change = JSON.parse((await sql(`begin; set local role service_role;
      select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.claim_release_deliveries(500) c where c.release_id='${release}'; commit;`)).split('\n').find((line) => line.startsWith('[')))[0];
    assert.ok(change);
    await sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${person}',true);
      select public.release_set_subscription('${release}',false); commit;`);
    await sql(`begin; set local role service_role; select * from public.accept_release_delivery('${change.id}','${change.claim_token}'); commit;`);
    assert.equal(await sql(`select count(*) from public.notifications where target_id='${release}';`), '0');
    assert.equal(await sql(`select state from public.release_deliveries where id='${change.id}';`), 'suppressed');
    console.log('PASS: concurrent release claims/acceptances, expired lease recovery, retention dedupe and consent withdrawal.');
    await verifyReleaseWriteConcurrency(sql, person);
  } finally {
    await sql(`begin; delete from public.notifications where target_type='release' and target_id='${release}';
      delete from public.cultural_releases where id='${release}'; delete from auth.users where id='${person}'; commit;`);
    assert.equal(await sql(`select count(*) from public.release_deliveries where release_id='${release}';`), '0');
  }
}
