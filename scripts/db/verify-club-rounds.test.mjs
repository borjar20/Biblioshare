import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MATRIX_CASES, recoverClubRounds, verifyClubRounds } from './verify-club-rounds.mjs';

// Execute the actual local/CI entry point. Only its process/filesystem and
// separately exercised DB checker boundaries are replaced; no Docker is run.
function controlledCaller(denied = false) {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { join, resolve } from 'node:path';
    import { SourceTextModule, SyntheticModule } from 'node:vm';
    const calls = [];
    const releaseCalls = [];
    const sqlCalls = [];
    const projectId = 'biblioshare-local-12345678';
    const root = '/controlled-checkout';
    const replacements = {
      'node:assert/strict': { default: assert },
      'node:child_process': { execFileSync: (_exe, _args, options) => {
        sqlCalls.push(options.input);
        return options.input.includes('schema_migrations') ? '20260101' : '';
      } },
      'node:fs': { readFileSync: (path) => path.endsWith('bootstrap.json')
        ? JSON.stringify({ projectId, migrations: [{ version: '20260101' }] }) : '-- controlled SQL' },
      'node:path': { join, resolve },
      './bootstrap.mjs': { repoRoot: root, loadPlan: () => [{ version: '20260101' }] },
      './activate-local-celebrations.mjs': {
        preparedLocalActivation: () => ({ container: 'supabase_db_' + projectId }),
      },
      './verify-club-rounds.mjs': {
        clubRoundsOptions: () => {
          if (${denied}) throw new Error('NOT_RUN: GO missing');
          return { receipt: { controlled: true } };
        },
        verifyClubRounds: async (id, options) => calls.push({ id, receipt: options.receipt }),
      },
      './verify-quota-concurrency.mjs': { verifyQuotaConcurrency: async () => {} },
      './check-google-volume-quota-concurrency.mjs': { verifyGoogleVolumeQuotaConcurrency: async () => {} },
      './verify-catalog-reference-concurrency.mjs': { verifyCatalogReferenceConcurrency: async () => {} },
      './check-book-edition-isbn-concurrency.mjs': { verifyBookEditionIsbnConcurrency: async () => {} },
      './verify-experience-concurrency.mjs': { verifyExperienceConcurrency: async () => {} },
      './verify-comparison-concurrency.mjs': { verifyComparisonConcurrency: async () => {} },
      './verify-release-concurrency.mjs': {
        verifyReleaseConcurrency: async (id) => releaseCalls.push({ id, clubChecks: calls.length }),
      },
    };
    const module = new SourceTextModule(readFileSync(${JSON.stringify(fileURLToPath(new URL('./verify.mjs', import.meta.url)))}, 'utf8'));
    await module.link((name) => {
      const exports = replacements[name];
      if (!exports) throw new Error('Uncontrolled import: ' + name);
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      });
    });
    let message;
    try { await module.evaluate(); } catch (error) {
      if (!${denied}) throw error;
      message = error.message;
    }
    console.log(JSON.stringify({ calls, releaseCalls, sqlCalls, message }));
  `;
  const output = execFileSync(process.execPath,
    ['--experimental-vm-modules', '--input-type=module', '--eval', script],
    { encoding: 'utf8', windowsHide: true });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test('the local/CI entry point reaches the club-rounds checker', () => {
  assert.deepEqual(controlledCaller().calls, [{
    id: 'biblioshare-local-12345678', receipt: { controlled: true },
  }], 'the real entry point must run the club matrix/concurrency checker');
});

test('the local/CI entry point reaches the release concurrency checker after the guarded club check', () => {
  assert.deepEqual(controlledCaller().releaseCalls, [{
    id: 'biblioshare-local-12345678', clubChecks: 1,
  }], 'the real entry point must run the release checker once against the same guarded local project');
});

test('the real entry point checks its GO before even the migration-ledger query', () => {
  const result = controlledCaller(true);
  assert.equal(result.message, 'NOT_RUN: GO missing');
  assert.deepEqual(result.calls, [], 'a missing GO must not start the club checker');
  assert.deepEqual(result.releaseCalls, [], 'a missing GO must not start the release checker');
  assert.deepEqual(result.sqlCalls, [], 'a missing GO must leave the local backend untouched');
});

const projectId = 'biblioshare-local-12345678';
const receipt = { projectId, container: `supabase_db_${projectId}`,
  scope: 'exclusive-disposable-local', qa975Finished: true, qaActors: 0, port3000Free: true };
const winningId = '00000000-0000-4000-8000-000000000401';
const originalClock = { oid: '401', definition: 'CREATE OR REPLACE FUNCTION private.club_now() RETURNS timestamp LANGUAGE sql STABLE AS $$ select now()::timestamp $$;',
  owner: '10', acl: '{postgres=X/postgres}', config: ['search_path=""'], anonExecute: false, authenticatedExecute: false };
const blocked = [
  { pid: 4011, mode: 'RowExclusiveLock', granted: false },
  { pid: 4012, mode: 'RowExclusiveLock', granted: false },
];

// The process/DB boundary supplies observations; all receipt, barrier, result,
// error aggregation and restoration decisions execute in the real checker.
// This is an orchestration contract, never evidence of SQL parsing or locks.
function controlledDatabase(options = {}) {
  let clock = structuredClone(originalClock);
  let journal;
  let workerIndex = 0;
  let observation = 0;
  let rows = 0;
  const events = [];
  const queries = [];
  const sessions = [];
  const driver = {
    events, queries, sessions,
    get clock() { return clock; }, get journal() { return journal; }, get rows() { return rows; },
    hasRecovery: () => Boolean(journal),
    saveRecovery(value) { journal = structuredClone(value); events.push('journal'); },
    clearRecovery() { journal = undefined; events.push('journal-cleared'); },
    loadRecovery: () => structuredClone(journal),
    async preflight() { events.push('preflight'); if (options.preflightError) throw options.preflightError; },
    async sql(query) {
      queries.push(query);
      if (query.includes('-- club-rounds:capture-clock')) return JSON.stringify(clock);
      if (query.startsWith('-- Matriz de regresión')) {
        events.push('matrix');
        if (options.matrixError) throw options.matrixError;
        if (options.matrixClockLeak) clock.definition = 'Leaked transactional clock';
        return MATRIX_CASES.filter((name) => name !== options.missingCase).map((name) => `PASS club-rounds:${name}`).join('\n');
      }
      if (query.includes('-- club-rounds:install-clock')) { events.push('fixed-clock'); clock.definition = 'Fixed local Wednesday clock'; return ''; }
      if (query.includes('-- club-rounds:restore-clock')) {
        events.push('restore');
        if (options.restoreError) throw options.restoreError;
        clock = structuredClone(originalClock);
        if (options.restoredOidMismatch) clock.oid = '999';
        return '';
      }
      if (query.includes('-- club-rounds:seed-race')) { events.push('seed'); rows = 2; return ''; }
      if (query.includes('-- club-rounds:race-preflight')) return JSON.stringify({ period: '2026-W40', day: 3, rounds: 0 });
      if (query.includes('-- club-rounds:observe-barrier')) {
        const locks = options.observations?.[observation++] ?? blocked;
        events.push(`observed:${locks.length}`);
        return JSON.stringify(locks);
      }
      if (query.includes('-- club-rounds:race-result')) return JSON.stringify({
        rounds: options.roundCount ?? 1, id: winningId, authors: 0, canonical: true, period: '2026-W40', targets: 1,
      });
      if (query.includes('-- club-rounds:cleanup-race')) {
        events.push('cleanup-race');
        if (options.cleanupError) throw options.cleanupError;
        rows = 0; return '';
      }
      if (query.includes('-- club-rounds:cleanup-counts')) return JSON.stringify({ actors: rows,
        profiles: rows, clubs: 0, members: 0, rounds: 0, targets: 0 });
      if (query.includes('-- club-rounds:cleanup-matrix')) { events.push('cleanup-matrix'); return ''; }
      if (query.includes('-- club-rounds:matrix-cleanup-counts')) return JSON.stringify({
        actors: 0, profiles: 0, clubs: 0, members: 0, rounds: 0, targets: 0,
      });
      if (query.includes('-- club-rounds:matrix-actors')) return '0';
      if (query.includes('pg_terminate_backend')) { events.push('recover-session'); return ''; }
      throw new Error('Uncontrolled SQL boundary');
    },
    openSession(_sql, name, keepOpen) {
      const index = keepOpen ? -1 : workerIndex++;
      const session = {
        applicationName: name, closed: false, done: Promise.resolve(''),
        async waitLine(prefix) {
          if (prefix === 'LOCKED|') return 'yes';
          if (prefix === 'PID|') return String(options.samePid ? 4011 : 4011 + index);
          if (prefix === 'RESULT|') {
            if (options.workerError && index === 1) throw options.workerError;
            return options.loserNull && index === 1 ? 'NULL' : winningId;
          }
          throw new Error('Uncontrolled session output');
        },
        async finish() { events.push('release'); session.closed = true; return ''; },
      };
      events.push(keepOpen ? 'lock' : `worker:${index}`);
      sessions.push(session);
      return session;
    },
    async close(session) {
      events.push('close');
      if (options.closeError) throw options.closeError;
      session.closed = true;
    },
  };
  return driver;
}

const run = (driver, extra = {}) => verifyClubRounds(projectId, {
  receipt, driver, pause: async () => {}, barrierAttempts: 3, ...extra,
});

test('the real race seed fits the canonical club slug constraint and cleans its original club ID', async (context) => {
  const constraintSource = readFileSync(new URL('../../supabase/migrations/20260715_text_length_limits.sql', import.meta.url), 'utf8');
  const constraint = constraintSource.match(/clubs_slug_format\s+check\s*\(slug\s*~\s*'([^']+)'\)/i);
  assert.ok(constraint, 'read the product constraint instead of inventing a fixture-only limit');
  const acceptedSlug = new RegExp(constraint[1]);
  const fixtures = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const driver = controlledDatabase();
    await run(driver);
    const seed = driver.queries.find((query) => query.includes('-- club-rounds:seed-race'));
    const inserted = seed?.match(/insert\s+into\s+public\.clubs\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/i);
    assert.ok(inserted, 'observe the actual seed emitted by the public checker');
    const [, clubId, slug] = inserted;
    assert.match(slug, acceptedSlug, `the actual race seed slug (${slug.length} characters) must satisfy clubs_slug_format`);
    const cleanup = driver.queries.find((query) => query.includes('-- club-rounds:cleanup-race'));
    const deleted = cleanup?.match(/delete\s+from\s+public\.clubs\s+where\s+id\s*=\s*'([^']+)'/i);
    assert.ok(deleted, 'the original cleanup must still own the seeded club');
    assert.equal(deleted[1], clubId);
    fixtures.push({ clubId, slug });
    context.diagnostic(`actual race seed ${attempt + 1}: slug length ${slug.length}; cleanup owns the original club ID`);
  }
  assert.notEqual(fixtures[0].clubId, fixtures[1].clubId);
  assert.notEqual(fixtures[0].slug, fixtures[1].slug, 'separate fixtures cannot share a constant valid slug');
});

test('a missing or mismatched local GO refuses all DB access', async () => {
  for (const invalid of [undefined, { ...receipt, projectId: 'biblioshare-local-87654321' },
    { ...receipt, container: 'shared-db' }, { ...receipt, qa975Finished: false },
    { ...receipt, qaActors: 1 }, { ...receipt, port3000Free: false }]) {
    const driver = controlledDatabase();
    await assert.rejects(run(driver, { receipt: invalid }));
    assert.deepEqual(driver.events, []);
  }
});

test('matrix and observed two-session conflict return PASS only after cleanup/restoration', async () => {
  const driver = controlledDatabase({ observations: [[], blocked.slice(0, 1), blocked] });
  const result = await run(driver);
  assert.equal(result.matrix, 'PASS');
  assert.equal(result.concurrency, 'PASS');
  assert.equal(result.cleanup, 'PASS');
  assert.equal(result.restoration, 'PASS');
  assert.deepEqual(result.barrier, blocked);
  assert.equal(result.roundId, winningId);
  assert.equal(result.clockBeforeHash, result.clockAfterHash);
  assert.ok(driver.events.indexOf('observed:2') < driver.events.indexOf('release'));
  assert.ok(driver.events.indexOf('journal') < driver.events.indexOf('fixed-clock'));
  assert.equal(driver.rows, 0);
  assert.deepEqual(driver.clock, originalClock);
  assert.equal(driver.journal, undefined);
  assert.ok(driver.sessions.every((session) => session.closed));
});

test('an unexecuted matrix case cannot masquerade as SQL coverage', async () => {
  const driver = controlledDatabase({ missingCase: 'tuesday-early' });
  await assert.rejects(run(driver), (error) => {
    assert.match(error.message, /did not finish tuesday-early/);
    assert.equal(error.verification.matrix, 'FAIL');
    assert.equal(error.verification.concurrency, 'NOT_RUN');
    assert.equal(error.verification.restoration, 'PASS');
    return true;
  });
  assert.ok(!driver.events.includes('seed'));
  assert.deepEqual(driver.clock, originalClock);
});

test('a failed or leaking matrix restores its captured clock before any race', async () => {
  for (const options of [{ matrixError: new Error('matrix SQL rejection') }, { matrixClockLeak: true }]) {
    const driver = controlledDatabase(options);
    await assert.rejects(run(driver), (error) => {
      assert.equal(error.verification.restoration, 'PASS');
      assert.equal(error.verification.concurrency, 'NOT_RUN');
      return true;
    });
    assert.deepEqual(driver.clock, originalClock);
    assert.ok(!driver.events.includes('fixed-clock'));
  }
});

test('polling without two blocked INSERT locks fails instead of releasing the race', async () => {
  const driver = controlledDatabase({ observations: [[], blocked.slice(0, 1), blocked.slice(0, 1)] });
  await assert.rejects(run(driver), /two blocked INSERT locks/);
  assert.ok(!driver.events.includes('release'));
  assert.ok(driver.sessions.every((session) => session.closed));
  assert.deepEqual(driver.clock, originalClock);
  assert.equal(driver.rows, 0);
});

test('two observations of the same PID do not count as two sessions', async () => {
  const driver = controlledDatabase({ samePid: true });
  await assert.rejects(run(driver), /two real PostgreSQL sessions/);
  assert.ok(!driver.events.includes('release'));
  assert.equal(driver.rows, 0);
  assert.deepEqual(driver.clock, originalClock);
});

test('a NULL conflict loser is rejected and still cleans/restores', async () => {
  const driver = controlledDatabase({ loserNull: true });
  await assert.rejects(run(driver), /both ensure calls must return a UUID/);
  assert.equal(driver.rows, 0);
  assert.deepEqual(driver.clock, originalClock);
});

test('equal IDs alone cannot hide a duplicate physical round', async () => {
  const driver = controlledDatabase({ roundCount: 2 });
  await assert.rejects(run(driver), (error) => {
    assert.equal(error.verification.concurrency, 'FAIL');
    assert.equal(error.verification.restoration, 'PASS');
    return true;
  });
});

test('worker and cleanup failures remain distinct and never prevent clock restoration', async () => {
  const primary = new Error('worker SQL rejected');
  const cleanup = new Error('owned cleanup rejected');
  const driver = controlledDatabase({ workerError: primary, cleanupError: cleanup });
  await assert.rejects(run(driver), (error) => {
    assert.equal(error.cause, primary);
    assert.deepEqual(error.errors, [primary, cleanup]);
    assert.match(error.message, /worker SQL rejected.*owned cleanup rejected/);
    assert.equal(error.verification.cleanup, 'FAIL');
    assert.equal(error.verification.restoration, 'PASS');
    return true;
  });
  assert.deepEqual(driver.clock, originalClock);
  assert.ok(driver.journal, 'failed cleanup needs a recoverable journal');
});

test('a restored body with a different OID is a failure and keeps recovery evidence', async () => {
  const driver = controlledDatabase({ restoredOidMismatch: true });
  await assert.rejects(run(driver), (error) => {
    assert.equal(error.verification.restoration, 'FAIL');
    assert.equal(error.verification.cleanup, 'PASS');
    return true;
  });
  assert.ok(driver.journal);
});

test('an unclosed owned session keeps the journal even after rows and clock are restored', async () => {
  const driver = controlledDatabase({ closeError: new Error('session termination failed') });
  await assert.rejects(run(driver), (error) => {
    assert.equal(error.verification.cleanup, 'FAIL');
    assert.equal(error.verification.restoration, 'PASS');
    return true;
  });
  assert.equal(driver.rows, 0);
  assert.deepEqual(driver.clock, originalClock);
  assert.ok(driver.journal);
});

test('a restoration SQL error stays FAIL and preserves the recovery snapshot', async () => {
  const driver = controlledDatabase({ restoreError: new Error('restore SQL rejected') });
  await assert.rejects(run(driver), (error) => {
    assert.match(error.message, /restore SQL rejected/);
    assert.equal(error.verification.restoration, 'FAIL');
    return true;
  });
  assert.notDeepEqual(driver.clock, originalClock);
  assert.deepEqual(driver.journal.clock, originalClock);
});

test('a previous incomplete fixture must be recovered before another matrix starts', async () => {
  const driver = controlledDatabase({ restoredOidMismatch: true });
  await assert.rejects(run(driver)); // produces the actual checker journal
  const matricesBefore = driver.events.filter((event) => event === 'matrix').length;
  await assert.rejects(run(driver), /recover the previous/);
  assert.equal(driver.events.filter((event) => event === 'matrix').length, matricesBefore);
  const cleanDriver = controlledDatabase();
  cleanDriver.saveRecovery(driver.journal);
  const result = await recoverClubRounds(projectId, { receipt, driver: cleanDriver });
  assert.equal(result.recovery, 'PASS');
  assert.equal(cleanDriver.events.filter((event) => event === 'recover-session').length, 3);
  assert.ok(!cleanDriver.journal);
  assert.deepEqual(cleanDriver.clock, originalClock);
});
