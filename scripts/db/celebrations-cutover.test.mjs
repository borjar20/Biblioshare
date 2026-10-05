import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activationTransaction, CutoverBlocked, runCelebrationsCutover, validateObservation,
  waitForCelebrationsQuiescence, renderEmptyBootstrapCutoverContextSql } from './celebrations-cutover.mjs';

function observation(backends = []) {
  return { database_oid: 10, table_oid: 20, observer_role: 'postgres', observer_pid: 90,
    observer_backend_start: '2026-10-03T10:00:00+00:00', cutoff: '2026-10-03T11:00:00+00:00',
    full_stats: true, track_activities: 'on', claim_shape_ready: true, rpc_overload_count: 4, prepared_transactions: 0, backends,
    functions: ['pull_pending_celebrations', 'claim_next_celebration', 'ack_celebration', 'release_celebration'].map((name, i) => ({
      oid: 30 + i, name, definition_md5: 'a'.repeat(32), security_definer: name === 'pull_pending_celebrations',
      search_path: ['search_path=public, pg_temp'], public_execute: false, authenticated_execute: false,
      anon_execute: false, ordinary_executors: [], privileged_executors: ['postgres'],
    })) };
}
const tx = (pid, state = 'idle in transaction', backend_type = 'client backend') => ({
  pid, backend_start: '2026-10-03T10:00:00+00:00', xact_start: '2026-10-03T10:55:00+00:00',
  state, backend_type, pre_cutoff: true,
});

test('real PostgreSQL JSON oid strings are accepted; malformed identities fail closed', () => {
  const snapshot = observation(); snapshot.database_oid = '21723'; snapshot.table_oid = '21746';
  snapshot.functions.forEach((f) => { f.oid = String(f.oid); });
  assert.doesNotThrow(() => validateObservation(snapshot));
  for (const value of ['0', '1e4', '4294967296', null]) {
    assert.throws(() => validateObservation({ ...snapshot, database_oid: value }), CutoverBlocked);
  }
});

test('hidden activity cannot turn a filtered empty cohort into PASS', () => {
  for (const change of [
    { full_stats: false }, { track_activities: 'off' },
    { backends: [{ ...tx(1), backend_type: null, state: null, xact_start: null }] },
    { backends: [{ ...tx(1), xact_start: null }] }, { prepared_transactions: 1 }, { rpc_overload_count: 5 },
    { backends: [{ ...tx(1), pre_cutoff: undefined }] },
    { backends: [{ ...tx(1), state: 'disabled', xact_start: null, pre_cutoff: null }] },
  ]) assert.throws(() => validateObservation({ ...observation(), ...change }), CutoverBlocked);
});

test('PUBLIC, inherited ordinary and direct authenticated routes each block', () => {
  for (const change of [{ public_execute: true }, { ordinary_executors: ['inherited_caller'] }, { authenticated_execute: true }]) {
    const snapshot = observation();
    Object.assign(snapshot.functions[0], change);
    assert.throws(() => validateObservation(snapshot), /admission remains open/);
  }
});

test('no transport call or activation without explicit privileged-dispatch pause', async () => {
  let calls = 0;
  await assert.rejects(waitForCelebrationsQuiescence({ executeJson: async () => { calls++; return observation(); } }), CutoverBlocked);
  assert.equal(calls, 0);
});

test('all kinds of pre-cut transactions must be terminal, including idle and background', async () => {
  const snapshots = [observation([tx(1, 'active'), tx(2), tx(3, null, 'autovacuum worker')]),
    observation([{ ...tx(2), xact_start: null, state: 'idle' }])];
  const receipts = [];
  const proof = await waitForCelebrationsQuiescence({ executeJson: async () => snapshots.shift(),
    privilegedDispatchPaused: true, onReceipt: (r) => receipts.push(r), timeoutMs: 0 });
  assert.equal(proof.gate.cohort.length, 3);
  assert.equal(proof.terminalReceipts.length, 3);
  assert.equal(receipts.at(-1).other_transactions, 0);
});

test('a pre-cut waiter and a new post-cut transaction block independently', async () => {
  for (const fresh of [observation([tx(1)]), observation([{ ...tx(2), pre_cutoff: false }])]) {
    let calls = 0;
    await assert.rejects(waitForCelebrationsQuiescence({
      executeJson: async () => ++calls === 1 ? observation([tx(1)]) : fresh,
      privilegedDispatchPaused: true, timeoutMs: 0,
    }), /Quiescence timeout/);
  }
});

test('identity or effective ACL changes while waiting require a new inspection', async () => {
  for (const change of [(s) => { s.database_oid++; }, (s) => { s.functions[0].definition_md5 = 'b'.repeat(32); }]) {
    let calls = 0;
    const fresh = observation(); change(fresh);
    await assert.rejects(waitForCelebrationsQuiescence({ executeJson: async () => ++calls === 1 ? observation() : fresh,
      privilegedDispatchPaused: true, timeoutMs: 0 }), /identity changed/);
  }
});

test('activation and ledger use one transaction, and run always reads guarded repo migration', async () => {
  const executed = [];
  await runCelebrationsCutover({ executeJson: async () => observation(), execute: async (sql) => executed.push(sql),
    ledger: { version: '20000101000284', name: 'activate_recoverable_celebrations' }, privilegedDispatchPaused: true });
  assert.equal(executed.length, 1);
  assert.match(executed[0], /^begin isolation level read committed;/);
  assert.match(executed[0], /Other current transactions block celebration activation/);
  assert.ok(executed[0].indexOf('grant execute') < executed[0].indexOf('insert into supabase_migrations.schema_migrations'));
  assert.match(executed[0], /commit;$/);
  assert.throws(() => activationTransaction({}, { version: "'unsafe", name: 'x' }), CutoverBlocked);
});

test('empty bootstrap renderer requires explicit pause, full visibility and zero live transactions', () => {
  const sql = renderEmptyBootstrapCutoverContextSql();
  assert.match(sql, /pg_stat_clear_snapshot\(\)/);
  assert.match(sql, /Explicit privileged-dispatch pause attestation required/);
  assert.match(sql, /row_security_active\('auth.users'/);
  assert.match(sql, /exists \(select 1 from auth.users\)/);
  assert.match(sql, /a->>'xact_start' is not null/);
  assert.match(sql, /'cohort', '\[\]'::jsonb/);
});
