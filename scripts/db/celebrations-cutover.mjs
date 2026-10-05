import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ACTIVATION_MIGRATION = Object.freeze({
  file: '20261003184427_activate_recoverable_celebrations.sql',
  version: '20261003184427',
  name: 'activate_recoverable_celebrations',
});
const activationPath = new URL(`../../supabase/migrations/${ACTIVATION_MIGRATION.file}`, import.meta.url);

// executeJson must use an autocommit inspection call AFTER phase 2 committed.
// No query text, claims, password, URL or private row is read by this inspection.
// Clear before EVERY observation: stats_fetch_consistency=cache is common.
const OBSERVATION_SELECT_SQL = `
with marker as materialized (select clock_timestamp() as cutoff),
functions as (
  select p.* from pg_proc p where p.oid = any(array[
    to_regprocedure('public.pull_pending_celebrations()'),
    to_regprocedure('public.claim_next_celebration(text[])'),
    to_regprocedure('public.ack_celebration(uuid,uuid)'),
    to_regprocedure('public.release_celebration(uuid,uuid)')
  ]::oid[])
), activity as materialized (
  select a.pid, a.backend_start, a.xact_start, a.state, a.backend_type,
    a.usename, a.wait_event_type, a.wait_event,
    pg_blocking_pids(a.pid) as blockers, a.xact_start <= m.cutoff as pre_cutoff
  from pg_stat_activity a cross join marker m
  where a.datid = (select oid from pg_database where datname = current_database())
    and a.pid <> pg_backend_pid()
)
select jsonb_build_object(
  'database_oid', (select oid from pg_database where datname = current_database()),
  'database_name', current_database(), 'cutoff', m.cutoff,
  'observer_role', current_user, 'observer_pid', pg_backend_pid(),
  'observer_backend_start', (select backend_start from pg_stat_activity where pid = pg_backend_pid()),
  'full_stats', r.rolsuper or pg_has_role(r.oid, 'pg_read_all_stats', 'USAGE'),
  'track_activities', current_setting('track_activities'),
  'stats_fetch_consistency', current_setting('stats_fetch_consistency'),
  'table_oid', to_regclass('public.user_celebrations')::oid,
  'rpc_overload_count', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('pull_pending_celebrations','claim_next_celebration','ack_celebration','release_celebration')),
  'claim_shape_ready', exists (
    select 1 from pg_class c where c.oid = to_regclass('public.user_celebrations')
      and c.relrowsecurity
      and (select count(*) from pg_attribute a where a.attrelid = c.oid and not a.attisdropped
        and ((a.attname = 'claim_token' and a.atttypid = 'uuid'::regtype)
          or (a.attname = 'claim_expires_at' and a.atttypid = 'timestamptz'::regtype))) = 2
      and exists (select 1 from pg_constraint k where k.conrelid = c.oid
        and k.conname = 'user_celebrations_claim_pair' and k.contype = 'c' and k.convalidated)
  ),
  'functions', coalesce((select jsonb_agg(jsonb_build_object(
    'oid', f.oid, 'name', f.proname, 'definition_md5', md5(pg_get_functiondef(f.oid)),
    'security_definer', f.prosecdef, 'result', pg_get_function_result(f.oid),
    'search_path', f.proconfig,
    'public_execute', exists (select 1 from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
    'anon_execute', has_function_privilege('anon', f.oid, 'EXECUTE'),
    'ordinary_executors', coalesce((select jsonb_agg(c.rolname order by c.rolname) from pg_roles c
      where not c.rolsuper and not pg_has_role(c.oid, f.proowner, 'USAGE')
        and has_function_privilege(c.oid, f.oid, 'EXECUTE')), '[]'::jsonb),
    'privileged_executors', coalesce((select jsonb_agg(c.rolname order by c.rolname) from pg_roles c
      where c.rolsuper or pg_has_role(c.oid, f.proowner, 'MEMBER')), '[]'::jsonb)
  ) order by f.oid) from functions f), '[]'::jsonb),
  'prepared_transactions', (select count(*) from pg_prepared_xacts where database = current_database()),
  'backends', coalesce((select jsonb_agg(to_jsonb(a) order by a.pid) from activity a), '[]'::jsonb)
) from marker m join pg_roles r on r.rolname = current_user
`;
export const QUIESCENCE_INSPECTION_SQL = `select pg_stat_clear_snapshot();\n${OBSERVATION_SELECT_SQL};`;

// The psql empty-bootstrap entrypoint needs a committed pre-cut observation
// before its phase-3 BEGIN. It uses the same observation and final guard as the
// live checker; empty data alone never proves that an admitted call is terminal.
// Caller must explicitly attest privileged dispatch is paused, for example via
// a required psql variable and set_config. This DO runs in AUTOCOMMIT, not inside
// the final transaction. The session-local context is reset by the caller later.
export function renderEmptyBootstrapCutoverContextSql() {
  return `do $bootstrap_cutover$
declare
  v_snapshot jsonb;
  v_legacy jsonb;
  v_functions jsonb;
begin
  if current_setting('biblioshare.celebrations_privileged_dispatch_paused', true) is distinct from 'true' then
    raise exception using errcode = '55000', message = 'Explicit privileged-dispatch pause attestation required';
  end if;
  perform pg_stat_clear_snapshot();
  select observed.value into strict v_snapshot from (${OBSERVATION_SELECT_SQL}) observed(value);
  if v_snapshot->>'full_stats' is distinct from 'true'
     or v_snapshot->>'track_activities' is distinct from 'on'
     or v_snapshot->>'claim_shape_ready' is distinct from 'true'
     or v_snapshot->>'rpc_overload_count' is distinct from '4'
     or jsonb_array_length(v_snapshot->'functions') <> 4
     or v_snapshot->>'prepared_transactions' is distinct from '0'
     or exists (select 1 from jsonb_array_elements(v_snapshot->'functions') f
       where f->>'public_execute' is distinct from 'false'
         or f->>'authenticated_execute' is distinct from 'false'
         or f->>'anon_execute' is distinct from 'false'
         or jsonb_array_length(f->'ordinary_executors') <> 0)
     or exists (select 1 from jsonb_array_elements(v_snapshot->'backends') a
       where a->>'backend_start' is null or a->>'backend_type' is null or a->>'state' = 'disabled'
         or (a->>'backend_type' = 'client backend' and a->>'state' is null)
         or a->>'xact_start' is not null) then
    raise exception using errcode = '55000', message = 'Empty-bootstrap live visibility/ACL/quiescence gate blocked';
  end if;
  if row_security_active('auth.users'::regclass) or row_security_active('public.user_celebrations'::regclass)
     or exists (select 1 from auth.users) or exists (select 1 from public.user_celebrations) then
    raise exception using errcode = '55000', message = 'Bootstrap gate requires fully visible empty Auth and celebrations';
  end if;
  select f into strict v_legacy from jsonb_array_elements(v_snapshot->'functions') f
    where f->>'name' = 'pull_pending_celebrations';
  select jsonb_agg(jsonb_build_object('oid', f->'oid', 'definition_md5', f->'definition_md5'))
    into v_functions from jsonb_array_elements(v_snapshot->'functions') f;
  perform set_config('biblioshare.celebrations_cutover', jsonb_build_object(
    'version', 1, 'privileged_dispatch_paused', true,
    'database_oid', v_snapshot->'database_oid', 'table_oid', v_snapshot->'table_oid',
    'legacy_oid', v_legacy->'oid', 'legacy_definition_md5', v_legacy->'definition_md5',
    'observer_role', current_user, 'cutoff', v_snapshot->'cutoff',
    'cohort', '[]'::jsonb, 'functions', v_functions
  )::text, false);
end;
$bootstrap_cutover$;\n`;
}

export class CutoverBlocked extends Error {
  constructor(message) { super(message); this.name = 'CutoverBlocked'; }
}
const block = (message) => { throw new CutoverBlocked(message); };
const identity = (row) => ({ pid: row.pid, backend_start: row.backend_start, xact_start: row.xact_start });
const sameTransaction = (a, b) => a.pid === b.pid && a.backend_start === b.backend_start && a.xact_start === b.xact_start;
const functionIdentity = (snapshot) => snapshot.functions.map(({ oid, definition_md5 }) => ({ oid, definition_md5 }));
// PostgreSQL jsonb serializes oid as a decimal STRING, unlike integer pid/count.
const validOid = (value) => (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)
  && BigInt(value) <= 4_294_967_295n) || (Number.isInteger(value) && value > 0 && value <= 4_294_967_295);

export function validateObservation(snapshot) {
  if (!snapshot || snapshot.full_stats !== true || snapshot.track_activities !== 'on') {
    block('Full pg_read_all_stats USAGE/superuser and track_activities=on are required.');
  }
  if (!validOid(snapshot.database_oid) || !validOid(snapshot.table_oid)
      || !snapshot.cutoff || !snapshot.observer_role || !snapshot.observer_backend_start
      || snapshot.claim_shape_ready !== true || snapshot.rpc_overload_count !== 4 || !Array.isArray(snapshot.backends)) {
    block('Database identity, expansion or observation metadata is incomplete.');
  }
  if (!Array.isArray(snapshot.functions) || snapshot.functions.length !== 4
      || new Set(snapshot.functions.map((f) => f.name)).size !== 4) block('All four RPC objects must exist.');
  for (const f of snapshot.functions) {
    if (f.public_execute !== false || f.authenticated_execute !== false || f.anon_execute !== false
        || !Array.isArray(f.ordinary_executors) || f.ordinary_executors.length > 0) {
      block(`Effective ordinary EXECUTE admission remains open for ${f.name}.`);
    }
    if (!validOid(f.oid) || !/^[a-f0-9]{32}$/.test(f.definition_md5)) block('RPC identity is incomplete.');
    if (f.name !== 'pull_pending_celebrations' && (f.security_definer !== false
        || !f.search_path?.includes('search_path=public, pg_temp'))) block('Claim RPC security contract differs.');
  }
  if (snapshot.prepared_transactions !== 0) block('Prepared transactions block cutover.');
  for (const a of snapshot.backends) {
    if (!Number.isInteger(a.pid) || !a.backend_start || !a.backend_type || a.state === 'disabled' || !('xact_start' in a)
        || (a.xact_start !== null && typeof a.pre_cutoff !== 'boolean')
        || (a.backend_type === 'client backend' && !a.state)
        || (a.state?.startsWith('idle in transaction') && !a.xact_start)) {
      block('Hidden or incomplete backend activity blocks cutover.');
    }
  }
}

function unchangedTarget(first, fresh) {
  return first.database_oid === fresh.database_oid && first.table_oid === fresh.table_oid
    && first.observer_role === fresh.observer_role
    && JSON.stringify(functionIdentity(first)) === JSON.stringify(functionIdentity(fresh));
}

export async function waitForCelebrationsQuiescence({
  executeJson, privilegedDispatchPaused, timeoutMs = 60_000, onReceipt = () => {},
}) {
  if (privilegedDispatchPaused !== true) block('Confirm owner/superuser dispatch and relevant DDL are paused during cutover.');
  if (typeof executeJson !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 600_000) {
    block('Invalid cutover transport or timeout.');
  }
  const first = await executeJson(QUIESCENCE_INSPECTION_SQL);
  validateObservation(first);
  // This is all pre-cut transactions, without role/backend_type/query filters.
  const cohort = first.backends.filter((a) => a.xact_start !== null && a.pre_cutoff === true).map(identity);
  onReceipt({ kind: 'captured', cutoff: first.cutoff, observation: first, cohort });
  const deadline = Date.now() + timeoutMs;
  const terminalReceipts = [];
  const completed = new Set();
  while (true) {
    const fresh = await executeJson(QUIESCENCE_INSPECTION_SQL);
    validateObservation(fresh);
    if (!unchangedTarget(first, fresh)) block('Database/RPC identity changed while waiting; restart the cutover inspection.');
    for (const member of cohort) {
      const key = JSON.stringify(member);
      if (!completed.has(key) && !fresh.backends.some((a) => sameTransaction(a, member))) {
        completed.add(key);
        const receipt = { kind: 'terminal', member, observed_at: fresh.cutoff,
          current: fresh.backends.find((a) => a.pid === member.pid) ?? null };
        terminalReceipts.push(receipt);
        onReceipt(receipt);
      }
    }
    const otherTransactions = fresh.backends.filter((a) => a.xact_start !== null);
    if (completed.size === cohort.length && otherTransactions.length === 0) {
      const legacy = first.functions.find((f) => f.name === 'pull_pending_celebrations');
      const gate = { version: 1, privileged_dispatch_paused: true, database_oid: first.database_oid,
        table_oid: first.table_oid, legacy_oid: legacy.oid, legacy_definition_md5: legacy.definition_md5,
        observer_role: first.observer_role, cutoff: first.cutoff, cohort, functions: functionIdentity(first) };
      onReceipt({ kind: 'ready', cutoff: first.cutoff, observed_at: fresh.cutoff,
        cohort_size: cohort.length, terminal_count: completed.size, other_transactions: 0 });
      return { gate, terminalReceipts };
    }
    if (Date.now() >= deadline) block(`Quiescence timeout: ${cohort.length - completed.size} pre-cut and ${otherTransactions.length} current transactions remain.`);
    // Poll scheduling only. Elapsed time never proves quiescence.
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(250, Math.max(1, deadline - Date.now()))));
  }
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function activationTransaction(gate, ledger, activationSql = readFileSync(activationPath, 'utf8')) {
  if (!ledger || !/^\d{14}$/.test(ledger.version) || !/^[a-z0-9_]{1,120}$/.test(ledger.name)) block('Explicit migration ledger version/name required.');
  return `begin isolation level read committed;
select set_config('biblioshare.celebrations_cutover', ${sqlLiteral(JSON.stringify(gate))}, true);
${activationSql}
insert into supabase_migrations.schema_migrations(version, name, statements)
values (${sqlLiteral(ledger.version)}, ${sqlLiteral(ledger.name)}, array[${sqlLiteral(activationSql)}]::text[]);
commit;`;
}

// A single final execute call is mandatory: context, independent SQL guard,
// no-op/grants and ledger insert either all commit or all roll back.
export async function runCelebrationsCutover(options) {
  if (typeof options.execute !== 'function') block('One-connection transactional SQL transport required.');
  const proof = await waitForCelebrationsQuiescence(options);
  await options.execute(activationTransaction(proof.gate, options.ledger));
  options.onReceipt?.({ kind: 'committed', migration: options.ledger, cohort_size: proof.gate.cohort.length });
  return proof;
}

export function dockerSqlTransport(container, database = 'postgres') {
  if (!/^supabase_db_[a-z0-9][a-z0-9_-]{0,100}$/.test(container) || !/^[a-z_][a-z0-9_]{0,62}$/.test(database)) {
    block('Explicit local Supabase container and database names required.');
  }
  const execute = (sql) => new Promise((resolveSql, rejectSql) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-Atq', '-U', 'postgres', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.once('error', () => rejectSql(new Error('Local Docker/psql transport unavailable.')));
    child.once('close', (code) => {
      if (code === 0) resolveSql(stdout.trim());
      else rejectSql(new Error(`PostgreSQL execution failed (SQLSTATE ${stderr.match(/ERROR:\s+([A-Z0-9]{5})/)?.[1] ?? 'unavailable'}).`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql + '\n');
  });
  return { execute, executeJson: async (sql) => JSON.parse((await execute(sql)).split('\n').filter(Boolean).at(-1)) };
}

async function cli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--container', '--database', '--ledger-version', '--ledger-name', '--timeout-ms']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--privileged-dispatch-paused') options.privilegedDispatchPaused = true;
    else if (allowed.has(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i]] = args[++i];
    else block('Unknown or missing CLI argument. No URL/password/environment inputs are accepted.');
  }
  const transport = dockerSqlTransport(options['--container'], options['--database']);
  await runCelebrationsCutover({ ...transport, privilegedDispatchPaused: options.privilegedDispatchPaused,
    ledger: { version: options['--ledger-version'] ?? ACTIVATION_MIGRATION.version,
      name: options['--ledger-name'] ?? ACTIVATION_MIGRATION.name },
    timeoutMs: options['--timeout-ms'] === undefined ? 60_000 : Number(options['--timeout-ms']),
    onReceipt: (receipt) => console.log(JSON.stringify(receipt)) });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
}
