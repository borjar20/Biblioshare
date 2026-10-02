import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const run = promisify(execFile);
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// Real competing connections, exclusively against a generated disposable DB.
export async function verifyGoogleVolumeQuotaConcurrency(projectId) {
  assert.match(projectId ?? '', /^biblioshare-local-[a-f0-9]{8}$/, 'pass a generated local project id');
  const container = `supabase_db_${projectId}`;
  const token = randomUUID().replaceAll('-', '');
  const prefix = `gbquota1237_${token}_`;
  const actors = [randomUUID(), randomUUID(), randomUUID()];
  const volumes = [prefix + 'shared', prefix + 'last_a', prefix + 'last_b'];
  const labels = ['shared_a', 'shared_b', 'last_a', 'last_b'].map((suffix) => prefix + suffix);
  const actorList = actors.map((actor) => `'${actor}'`).join(',');
  const volumeList = volumes.map((volume) => `'${volume}'`).join(',');
  const ownedBooks = `google_books_volume_id in (${volumeList})
    and left(google_books_volume_id, ${prefix.length}) = '${prefix}'`;
  const connections = [];
  const evidence = { projectId, actors, prefix, volumes, cases: [], commands: [], connections: [], cleanup: null };

  async function sql(name, query) {
    const args = ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-c', query];
    try {
      const result = await run('docker', args, { encoding: 'utf8', timeout: 15_000, windowsHide: true });
      evidence.commands.push({ name, query, status: 0, stdout: result.stdout, stderr: result.stderr });
      return result.stdout.trim();
    } catch (error) {
      evidence.commands.push({ name, query, status: error.code, stdout: error.stdout, stderr: error.stderr });
      throw error;
    }
  }

  function connect(name, actor, volume, label, held = false) {
    const query = `set application_name='${label}';
begin transaction isolation level read committed;
set local statement_timeout='12s';
set local idle_in_transaction_session_timeout='15s';
select set_config('request.jwt.claim.sub','${actor}',true);
set local role authenticated;
select 'VOLUME_UUID:' || public.register_catalog_item_by_volume('${volume}');
`;
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', spawnError, stdinError, timedOut = false;
    let onReady;
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.includes('VOLUME_UUID:')) onReady?.();
    });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (error) => { spawnError = String(error); });
    child.stdin.on('error', (error) => { stdinError = String(error); });
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 20_000);
    const completion = new Promise((resolveResult) => {
      child.once('close', (status, signal) => {
        clearTimeout(timeout);
        const result = { name, query, status, signal, stdout, stderr, spawnError, stdinError, timedOut };
        evidence.connections.push(result);
        resolveResult(result);
      });
    });
    const ready = held ? new Promise((resolveReady, reject) => {
      const readyTimeout = setTimeout(() => reject(new Error(`${name}: insertion was not observed`)), 8_000);
      onReady = () => { clearTimeout(readyTimeout); resolveReady(); };
      completion.then((result) => {
        clearTimeout(readyTimeout);
        if (!result.stdout.includes('VOLUME_UUID:')) reject(new Error(`${name}: ${result.stderr || result.spawnError || 'no volume UUID'}`));
      });
    }) : null;
    ready?.catch(() => {}); // Cleanup may need to settle an unawaited readiness failure.
    const release = (command = 'rollback;') => {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end(`${command}\n`);
    };
    const entry = { completion, ready, release };
    connections.push(entry);
    if (held) child.stdin.write(query);
    else child.stdin.end(`${query}commit;\n`);
    return entry;
  }

  async function requireBlocked(winnerLabel, loserLabel) {
    const deadline = Date.now() + 6_000;
    for (let attempt = 0; Date.now() < deadline; attempt += 1) {
      const blocked = await sql(`lock-${loserLabel}-${attempt}`, `select coalesce(bool_or(
        loser.wait_event_type='Lock' and winner.pid=any(pg_blocking_pids(loser.pid))),false)
        from pg_stat_activity loser cross join pg_stat_activity winner
        where loser.application_name='${loserLabel}' and winner.application_name='${winnerLabel}';`);
      if (blocked === 't') return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
    throw new Error(`${loserLabel}: a real lock held by the competing connection was not observed`);
  }

  function volumeUuid(result) {
    const value = result.stdout.match(/^VOLUME_UUID:([0-9a-f-]{36})$/m)?.[1];
    assert.match(value ?? '', uuidPattern, `${result.name}: no non-null volume UUID`);
    return value;
  }

  async function finishPair(winner, loser) {
    winner.release('commit;');
    const results = await Promise.allSettled([winner.completion, loser.completion]);
    for (const result of results) assert.equal(result.status, 'fulfilled', 'every connection must finish before inspecting the race');
    for (const { value } of results) assert.equal(value.timedOut, false, 'a connection exceeded its bound');
    return results.map(({ value }) => value);
  }

  let caseError, cleanupError;
  try {
    await sql('setup', `insert into auth.users(id) values ${actors.map((actor) => `('${actor}')`).join(',')};
      insert into private.request_quotas(user_id,operation,window_started_at,used) values
      ('${actors[1]}','catalog_google_volume_create',statement_timestamp(),60),
      ('${actors[2]}','catalog_google_volume_create',statement_timestamp(),59);`);

    const winner = connect('shared-winner', actors[0], volumes[0], labels[0], true);
    await winner.ready;
    const loser = connect('shared-loser', actors[1], volumes[0], labels[1]);
    await requireBlocked(labels[0], labels[1]);
    const shared = await finishPair(winner, loser);
    assert.deepEqual(shared.map(({ status }) => status), [0, 0], 'both authenticated calls must succeed');
    assert.equal(volumeUuid(shared[0]), volumeUuid(shared[1]), 'both accounts must reuse the same UUID');
    const sharedState = JSON.parse(await sql('shared-state', `select jsonb_build_object(
      'books',(select count(*) from public.books where google_books_volume_id='${volumes[0]}'),
      'winner_used',(select used from private.request_quotas where user_id='${actors[0]}' and operation='catalog_google_volume_create'),
      'loser_used',(select used from private.request_quotas where user_id='${actors[1]}' and operation='catalog_google_volume_create'),
      'generic_rows',(select count(*) from private.request_quotas where user_id in ('${actors[0]}','${actors[1]}') and operation='catalog_create'));`));
    assert.deepEqual(sharedState, { books: 1, winner_used: 1, loser_used: 60, generic_rows: 0 });
    evidence.cases.push({ name: 'two accounts racing for one volume', status: 'PASS', lockObserved: true,
      sameUuid: volumeUuid(shared[0]), state: sharedState, nativeStatuses: shared.map(({ status }) => status) });
    console.log('PASS #1237: two accounts racing for one volume charge only the insertion winner.');

    const lastWinner = connect('last-slot-winner', actors[2], volumes[1], labels[2], true);
    await lastWinner.ready;
    const lastLoser = connect('last-slot-loser', actors[2], volumes[2], labels[3]);
    await requireBlocked(labels[2], labels[3]);
    const lastSlot = await finishPair(lastWinner, lastLoser);
    assert.deepEqual(lastSlot.map(({ status }) => status), [0, 3], 'only one call may take the last quota slot');
    assert.match(lastSlot[1].stderr, /ERROR:\s+PT429:/, 'the competing creation must be rejected by the quota');
    const lastState = JSON.parse(await sql('last-slot-state', `select jsonb_build_object(
      'accepted',(select count(*) from public.books where google_books_volume_id='${volumes[1]}'),
      'rejected',(select count(*) from public.books where google_books_volume_id='${volumes[2]}'),
      'used',(select used from private.request_quotas where user_id='${actors[2]}' and operation='catalog_google_volume_create'));`));
    assert.deepEqual(lastState, { accepted: 1, rejected: 0, used: 60 });
    evidence.cases.push({ name: 'one account racing for the last slot', status: 'PASS', lockObserved: true,
      rejection: 'PT429', state: lastState, nativeStatuses: lastSlot.map(({ status }) => status) });
    console.log('PASS #1237: two different volumes racing for the last slot admit exactly one shell.');
  } catch (error) {
    caseError = error;
  } finally {
    // Release a failed held transaction, then wait for EVERY connection before
    // deleting fixtures. The normal reference guards remain enabled throughout.
    for (const connection of connections) connection.release();
    await Promise.allSettled(connections.map(({ completion }) => completion));
    try {
      const bookIds = JSON.parse(await sql('cleanup-book-ids', `select coalesce(jsonb_agg(id),'[]'::jsonb)
        from public.books where ${ownedBooks};`));
      for (const id of bookIds) assert.match(id, uuidPattern);
      const bookList = bookIds.map((id) => `'${id}'::uuid`).join(',') || 'null::uuid';
      await sql('cleanup', `delete from public.book_editions where book_id in
        (select id from public.books where ${ownedBooks});
        delete from public.books where ${ownedBooks};
        delete from auth.users where id in (${actorList});`);
      const cleanup = JSON.parse(await sql('cleanup-check', `select jsonb_build_object(
        'auth_users',(select count(*) from auth.users where id in (${actorList})),
        'profiles',(select count(*) from public.profiles where user_id in (${actorList})),
        'quotas',(select count(*) from private.request_quotas where user_id in (${actorList})),
        'books',(select count(*) from public.books where ${ownedBooks}),
        'editions',(select count(*) from public.book_editions where book_id in (${bookList})),
        'connections',(select count(*) from pg_stat_activity where application_name in (${labels.map((label) => `'${label}'`).join(',')})));`));
      evidence.cleanup = cleanup;
      assert.deepEqual(cleanup, { auth_users: 0, profiles: 0, quotas: 0, books: 0, editions: 0, connections: 0 },
        'every fixture and connection must be gone');
    } catch (error) {
      cleanupError = error;
    }
  }
  if (caseError || cleanupError) {
    const error = caseError && cleanupError ? new AggregateError([caseError, cleanupError], 'Google volume quota concurrency and cleanup failed')
      : caseError ?? cleanupError;
    error.evidence = evidence;
    throw error;
  }
  return evidence;
}
