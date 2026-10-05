import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { repoRoot } from './bootstrap.mjs';

export const MATRIX_CASES = [
  'real-madrid-clock', 'monday-early', 'monday-existing',
  'tuesday-early', 'tuesday-existing', 'wednesday-visible',
  'wednesday-materialized', 'wednesday-idempotent', 'wednesday-target',
  'wednesday-existing', 'rollback',
];
const FIXED_CLOCK = `create or replace function private.club_now()
returns timestamp language sql stable security invoker set search_path = ''
as $club_rounds_test$ select timestamp '2026-09-30 12:00:00'; $club_rounds_test$;`;
const CLOCK_QUERY = `-- club-rounds:capture-clock
select json_build_object('oid', p.oid::text, 'definition', pg_get_functiondef(p.oid),
  'owner', p.proowner::text, 'acl', p.proacl::text, 'config', p.proconfig,
  'anonExecute', has_function_privilege('anon', p.oid, 'execute'),
  'authenticatedExecute', has_function_privilege('authenticated', p.oid, 'execute'))
from pg_proc p where p.oid = 'private.club_now()'::regprocedure;`;
const MATRIX_USERS = ['00000000-0000-4000-8000-0000000002a1',
  '00000000-0000-4000-8000-0000000002b2', '00000000-0000-4000-8000-0000000002c3'];
const MATRIX_CLUBS = ['00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204',
  '00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000206'];
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function requireReceipt(projectId, receipt) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  assert.equal(receipt?.projectId, projectId, 'a GO receipt for this exact local project is required');
  assert.equal(receipt.container, `supabase_db_${projectId}`);
  assert.equal(receipt.scope, 'exclusive-disposable-local');
  assert.equal(receipt.qa975Finished, true);
  assert.equal(receipt.qaActors, 0);
  assert.equal(receipt.port3000Free, true);
}

// CI has just bootstrapped its own isolated job container. A local invocation
// instead needs the coordinator's receipt after the previous QA has cleaned up.
export function clubRoundsOptions(projectId, args = process.argv.slice(2)) {
  if (args.includes('--club-rounds-ci-exclusive')) {
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'CI exclusivity cannot authorize a local run');
    const receipt = { projectId, container: `supabase_db_${projectId}`,
      scope: 'exclusive-disposable-local', qa975Finished: true,
      qaActors: 0, port3000Free: true, authority: 'isolated-github-actions-job' };
    requireReceipt(projectId, receipt);
    return { receipt };
  }
  const index = args.indexOf('--club-rounds-receipt');
  assert.ok(index >= 0 && args[index + 1], 'NOT_RUN: provide --club-rounds-receipt <coordinator-GO.json>');
  const receipt = JSON.parse(readFileSync(args[index + 1], 'utf8'));
  requireReceipt(projectId, receipt);
  return { receipt };
}

function portFree(host) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: 3000 });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); reject(new Error('port 3000 is occupied')); });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(); else reject(error);
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('port 3000 availability is unknown')); });
  });
}

// This transport only accepts the generated disposable container name. There
// is no connection URL, password, remote SQL endpoint or service-role path.
export function dockerClubRoundsDriver(projectId) {
  assert.match(projectId, /^biblioshare-local-[a-f0-9]{8}$/);
  const container = `supabase_db_${projectId}`;
  const recoveryPath = join(repoRoot, '.superpowers/supabase-local/club-rounds-recovery.json');
  const run = promisify(execFile);

  function session(query, applicationName, keepOpen = false) {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres',
      '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], { windowsHide: true, stdio: 'pipe' });
    let output = '';
    let stderr = '';
    let closed = false;
    const listeners = new Set();
    const done = new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => { output += chunk; for (const notify of listeners) notify(); });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => {
        closed = true;
        if (code === 0) resolve(output.trim());
        else reject(new Error(`local psql exited ${code}: ${stderr.trim()}`));
        for (const notify of listeners) notify();
      });
      child.stdin.on('error', reject);
    });
    // A worker may fail while the coordinator is inspecting the barrier.
    done.catch(() => {});
    if (keepOpen) child.stdin.write(query); else child.stdin.end(query);
    return {
      applicationName, done, get closed() { return closed; },
      waitLine(prefix) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { listeners.delete(check); reject(new Error(`missing ${prefix} from local psql`)); }, 15000);
          function check() {
            const line = output.split(/\r?\n/).slice(0, -1).find((value) => value.startsWith(prefix));
            if (line !== undefined) { clearTimeout(timeout); listeners.delete(check); resolve(line.slice(prefix.length)); }
            else if (closed) { clearTimeout(timeout); listeners.delete(check); done.then(() => reject(new Error(`missing ${prefix}`)), reject); }
          }
          listeners.add(check);
          check();
        });
      },
      finish(query = '') { child.stdin.end(query); return done; },
      stop() { child.stdin.destroy(); child.kill(); },
    };
  }
  const sql = (query) => session(`set statement_timeout = '15s'; set lock_timeout = '10s';\n${query}`).done;
  return {
    sql, openSession: session,
    async preflight({ ownedUsers = [] } = {}) {
      assert.ok(!process.env.DOCKER_HOST, 'a Docker host override is outside this local fixture');
      const endpoint = (await run('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], { windowsHide: true })).stdout.trim();
      assert.match(endpoint, /^(?:npipe:\/\/\/\/\.\/pipe\/[^/]+|unix:\/\/\/[^\s]+)$/,
        'the Docker context must use a local pipe/socket');
      const name = (await run('docker', ['inspect', '--format', '{{.Name}}', container], { windowsHide: true })).stdout.trim();
      assert.equal(name, `/${container}`);
      await Promise.all([portFree('127.0.0.1'), portFree('::1')]);
      assert.equal(await sql("select current_database() || ':' || (current_setting('server_version_num')::int / 10000);"), 'postgres:17');
      assert.equal(await sql(`select count(*) from auth.users${ownedUsers.length ? ` where id not in (${ownedUsers.map(literal).join(',')})` : ''};`), '0',
        'the exclusive local DB must contain no previous QA actors');
    },
    saveRecovery(value) { writeFileSync(recoveryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); },
    clearRecovery() { unlinkSync(recoveryPath); },
    loadRecovery() { return JSON.parse(readFileSync(recoveryPath, 'utf8')); },
    hasRecovery() { return existsSync(recoveryPath); },
    async close(session) {
      if (!session.closed) {
        await sql(`select pg_terminate_backend(pid) from pg_stat_activity
          where application_name = ${literal(session.applicationName)} and pid <> pg_backend_pid();`);
        session.stop();
      }
      await session.done.catch(() => {});
    },
  };
}

function fixtureSql(fixture) {
  const [ana, beto] = fixture.users;
  return `-- club-rounds:seed-race
begin;
insert into auth.users (id, aud, role, email) values
 (${literal(ana)}, 'authenticated', 'authenticated', ${literal(`cr401-a-${fixture.club}@example.test`)}),
 (${literal(beto)}, 'authenticated', 'authenticated', ${literal(`cr401-b-${fixture.club}@example.test`)});
insert into public.profiles (user_id, username, display_name, is_public, role) values
 (${literal(ana)}, ${literal(`cr401_a_${fixture.club.slice(0, 8)}`)}, 'Ronda QA A', true, 'user'),
 (${literal(beto)}, ${literal(`cr401_b_${fixture.club.slice(0, 8)}`)}, 'Ronda QA B', true, 'user');
insert into public.clubs (id, slug, name, visibility, owner_id, created_at) values
 (${literal(fixture.club)}, ${literal(`cr401-${fixture.club.replaceAll('-', '')}`)}, '[TEST] Rondas 401', 'public', ${literal(ana)}, '2026-07-20 10:00:00+02');
insert into public.club_members (club_id, user_id, role, status, joined_at) values
 (${literal(fixture.club)}, ${literal(ana)}, 'owner', 'active', '2026-07-20 10:00:00+02'),
 (${literal(fixture.club)}, ${literal(beto)}, 'member', 'active', '2026-07-27 10:00:00+02');
commit;`;
}

async function cleanFixture(driver, fixture) {
  await driver.sql(`-- club-rounds:cleanup-race
begin;
delete from public.clubs where id = ${literal(fixture.club)};
delete from auth.users where id in (${fixture.users.map(literal).join(',')});
commit;`);
  const counts = JSON.parse(await driver.sql(`-- club-rounds:cleanup-counts
select json_build_object(
 'actors', (select count(*) from auth.users where id in (${fixture.users.map(literal).join(',')})),
 'profiles', (select count(*) from public.profiles where user_id in (${fixture.users.map(literal).join(',')})),
 'clubs', (select count(*) from public.clubs where id = ${literal(fixture.club)}),
 'members', (select count(*) from public.club_members where club_id = ${literal(fixture.club)}),
 'rounds', (select count(*) from public.club_rounds where club_id = ${literal(fixture.club)}),
 'targets', (select count(*) from public.interaction_targets where kind = 'club_round' and audience_id = ${literal(fixture.club)}));`));
  assert.deepEqual(counts, { actors: 0, profiles: 0, clubs: 0, members: 0, rounds: 0, targets: 0 }, 'the fixture must leave no owned rows');
}

async function cleanMatrix(driver) {
  // Normally there is nothing to delete: the SQL matrix ROLLBACK owns these
  // IDs. Preflight required an empty Auth DB before recording the journal.
  await driver.sql(`-- club-rounds:cleanup-matrix
begin;
delete from public.clubs where id in (${MATRIX_CLUBS.map(literal).join(',')});
delete from auth.users where id in (${MATRIX_USERS.map(literal).join(',')});
commit;`);
  const counts = JSON.parse(await driver.sql(`-- club-rounds:matrix-cleanup-counts
select json_build_object(
 'actors', (select count(*) from auth.users where id in (${MATRIX_USERS.map(literal).join(',')})),
 'profiles', (select count(*) from public.profiles where user_id in (${MATRIX_USERS.map(literal).join(',')})),
 'clubs', (select count(*) from public.clubs where id in (${MATRIX_CLUBS.map(literal).join(',')})),
 'members', (select count(*) from public.club_members where club_id in (${MATRIX_CLUBS.map(literal).join(',')})),
 'rounds', (select count(*) from public.club_rounds where club_id in (${MATRIX_CLUBS.map(literal).join(',')})),
 'targets', (select count(*) from public.interaction_targets where kind = 'club_round' and audience_id in (${MATRIX_CLUBS.map(literal).join(',')})));`));
  assert.deepEqual(counts, { actors: 0, profiles: 0, clubs: 0, members: 0, rounds: 0, targets: 0 }, 'the matrix must leave no owned rows');
}

async function restoreClock(driver, original) {
  await driver.sql(`-- club-rounds:restore-clock\n${original.definition}`);
  const restored = JSON.parse(await driver.sql(CLOCK_QUERY));
  assert.deepEqual(restored, original, 'clock definition, ACL, owner, settings and OID must be restored');
  return digest(restored);
}

export async function recoverClubRounds(projectId, options) {
  requireReceipt(projectId, options.receipt);
  const driver = options.driver ?? dockerClubRoundsDriver(projectId);
  // Recovery is intentionally before the normal actors=0 preflight: a killed
  // run may still own its two actors and its three named sessions.
  const saved = driver.loadRecovery();
  assert.equal(saved.version, 1);
  assert.equal(saved.projectId, projectId);
  assert.match(saved.fixture.club, uuidPattern);
  assert.equal(saved.fixture.users.length, 2);
  saved.fixture.users.forEach((id) => assert.match(id, uuidPattern));
  assert.notEqual(saved.fixture.users[0], saved.fixture.users[1]);
  assert.deepEqual(saved.fixture.sessionNames, ['lock', 'a', 'b'].map((suffix) => `cr401-${saved.fixture.club}-${suffix}`));
  assert.equal(saved.clockHash, digest(saved.clock), 'the clock recovery snapshot must be intact');
  await driver.preflight({ ownedUsers: [...saved.fixture.users, ...MATRIX_USERS] });
  const errors = [];
  for (const name of saved.fixture.sessionNames) {
    try { await driver.sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = ${literal(name)} and pid <> pg_backend_pid();`); }
    catch (error) { errors.push(error); }
  }
  try { await cleanFixture(driver, saved.fixture); } catch (error) { errors.push(error); }
  try { await cleanMatrix(driver); } catch (error) { errors.push(error); }
  try { await restoreClock(driver, saved.clock); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'club-rounds recovery failed; keep the journal', { cause: errors[0] });
  driver.clearRecovery();
  return { recovery: 'PASS', clockHash: digest(saved.clock), cleanup: 'PASS' };
}

export async function verifyClubRounds(projectId, options) {
  requireReceipt(projectId, options.receipt);
  const driver = options.driver ?? dockerClubRoundsDriver(projectId);
  const pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 50)));
  const fixture = { club: randomUUID(), users: [randomUUID(), randomUUID()] };
  fixture.sessionNames = ['lock', 'a', 'b'].map((suffix) => `cr401-${fixture.club}-${suffix}`);
  const report = { matrix: 'NOT_RUN', matrixCases: [], concurrency: 'NOT_RUN', cleanup: 'NOT_RUN', restoration: 'NOT_RUN', barrier: [] };
  const errors = [];
  const sessions = [];
  let original;
  let journalSaved = false;
  try {
    assert.ok(!driver.hasRecovery(), 'NOT_RUN: recover the previous club-rounds journal before testing');
    await driver.preflight();
    original = JSON.parse(await driver.sql(CLOCK_QUERY));
    assert.equal(original.anonExecute, false);
    assert.equal(original.authenticatedExecute, false);
    report.clockBeforeHash = digest(original);
    driver.saveRecovery({ version: 1, projectId, clock: original, clockHash: digest(original), fixture });
    journalSaved = true;
    report.matrix = 'FAIL';
    const matrix = await driver.sql(readFileSync(join(repoRoot, 'supabase/tests/club_rounds.sql'), 'utf8'));
    for (const name of MATRIX_CASES) assert.ok(matrix.split(/\r?\n/).includes(`PASS club-rounds:${name}`), `SQL matrix did not finish ${name}`);
    assert.deepEqual(JSON.parse(await driver.sql(CLOCK_QUERY)), original, 'the matrix ROLLBACK must restore the clock');
    assert.equal(await driver.sql(`-- club-rounds:matrix-actors\nselect count(*) from auth.users where id in (${MATRIX_USERS.map(literal).join(',')});`), '0');
    report.matrix = 'PASS';
    report.matrixCases = [...MATRIX_CASES];

    report.concurrency = 'FAIL';
    await driver.sql(`-- club-rounds:install-clock\n${FIXED_CLOCK}`);
    const fixed = JSON.parse(await driver.sql(CLOCK_QUERY));
    for (const key of ['oid', 'owner', 'acl', 'config', 'anonExecute', 'authenticatedExecute']) assert.deepEqual(fixed[key], original[key], `fixed clock must preserve ${key}`);
    await driver.sql(fixtureSql(fixture));
    const context = JSON.parse(await driver.sql(`-- club-rounds:race-preflight
select json_build_object('period', to_char(private.club_now(), 'IYYY-"W"IW'),
 'day', extract(isodow from private.club_now())::int,
 'rounds', (select count(*) from public.club_rounds where club_id = ${literal(fixture.club)}));`));
    assert.deepEqual(context, { period: '2026-W40', day: 3, rounds: 0 });

    const coordinator = driver.openSession(`set application_name = ${literal(fixture.sessionNames[0])};
set statement_timeout = '30s'; set idle_in_transaction_session_timeout = '30s';
begin; select 'PID|' || pg_backend_pid();
lock table public.club_rounds in exclusive mode;
select 'LOCKED|yes';\n`, fixture.sessionNames[0], true);
    sessions.push(coordinator);
    await coordinator.waitLine('LOCKED|');
    const workers = fixture.users.map((user, index) => {
      const worker = driver.openSession(`set application_name = ${literal(fixture.sessionNames[index + 1])};
set statement_timeout = '30s'; begin isolation level read committed;
select 'PID|' || pg_backend_pid(); set local role authenticated;
set local request.jwt.claims = ${literal(JSON.stringify({ sub: user, role: 'authenticated' }))};
select 'RESULT|' || coalesce(public.ensure_club_round(${literal(fixture.club)})::text, 'NULL');
commit;\n`, fixture.sessionNames[index + 1]);
      sessions.push(worker);
      return worker;
    });
    const pids = await Promise.all(workers.map(async (worker) => {
      const pid = Number(await worker.waitLine('PID|'));
      assert.ok(Number.isSafeInteger(pid) && pid > 0);
      return pid;
    }));
    assert.notEqual(pids[0], pids[1], 'two real PostgreSQL sessions are required');
    for (let attempt = 0; attempt < (options.barrierAttempts ?? 100); attempt++) {
      const locks = JSON.parse(await driver.sql(`-- club-rounds:observe-barrier
select coalesce(json_agg(json_build_object('pid', l.pid, 'mode', l.mode, 'granted', l.granted)), '[]'::json)
from pg_locks l join pg_stat_activity a using (pid)
where l.relation = 'public.club_rounds'::regclass and l.mode = 'RowExclusiveLock' and not l.granted
 and l.pid in (${pids.join(',')}) and a.application_name in (${fixture.sessionNames.slice(1).map(literal).join(',')});`));
      if (locks.length === 2 && pids.every((pid) => locks.some((lock) => lock.pid === pid && lock.mode === 'RowExclusiveLock' && lock.granted === false))) {
        report.barrier = locks;
        break;
      }
      await pause(); // polling cadence only; elapsed time is never the proof
    }
    assert.equal(report.barrier.length, 2, 'two blocked INSERT locks must be observed before releasing the barrier');
    await coordinator.finish('rollback;\n');
    const ids = await Promise.all(workers.map((worker) => worker.waitLine('RESULT|')));
    await Promise.all(workers.map((worker) => worker.done));
    ids.forEach((id) => assert.match(id, uuidPattern, 'both ensure calls must return a UUID, including the conflict loser'));
    assert.equal(ids[0], ids[1], 'both responders must receive the winning round');
    const row = JSON.parse(await driver.sql(`-- club-rounds:race-result
select json_build_object('rounds', count(*), 'id', min(id::text),
 'authors', count(author_id), 'canonical', bool_and(prompt = private.house_prompt(${literal(fixture.club)}, '2026-W40')),
 'period', min(period_key), 'targets', (select count(*) from public.interaction_targets
   where kind = 'club_round' and audience_id = ${literal(fixture.club)}))
from public.club_rounds where club_id = ${literal(fixture.club)};`));
    assert.deepEqual(row, { rounds: 1, id: ids[0], authors: 0, canonical: true, period: '2026-W40', targets: 1 });
    report.concurrency = 'PASS';
    report.roundId = ids[0];
  } catch (error) { errors.push(error); }
  finally {
    const sessionCleanupErrors = [];
    for (const session of sessions) {
      try { await driver.close(session); } catch (error) { sessionCleanupErrors.push(error); }
    }
    if (journalSaved) {
      const cleanupErrors = [...sessionCleanupErrors];
      try { await cleanFixture(driver, fixture); } catch (error) { cleanupErrors.push(error); }
      try { await cleanMatrix(driver); } catch (error) { cleanupErrors.push(error); }
      report.cleanup = cleanupErrors.length ? 'FAIL' : 'PASS';
      errors.push(...cleanupErrors);
      try {
        report.clockAfterHash = await restoreClock(driver, original);
        report.restoration = 'PASS';
      } catch (error) { report.restoration = 'FAIL'; errors.push(error); }
      if (report.restoration === 'PASS' && report.cleanup === 'PASS') {
        try { driver.clearRecovery(); } catch (error) { errors.push(error); }
      }
    }
  }
  if (errors.length) {
    const error = new AggregateError(errors, `club-rounds FAIL: ${errors.map((item) => item.message).join('; ')}`, { cause: errors[0] });
    error.verification = report;
    throw error;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const stamp = JSON.parse(readFileSync(join(repoRoot, '.superpowers/supabase-local/bootstrap.json'), 'utf8'));
  const options = clubRoundsOptions(stamp.projectId);
  const result = process.argv.includes('--restore-clock')
    ? await recoverClubRounds(stamp.projectId, options)
    : await verifyClubRounds(stamp.projectId, options);
  console.log(JSON.stringify(result, null, 2));
}
