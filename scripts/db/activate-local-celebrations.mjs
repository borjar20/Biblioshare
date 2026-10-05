import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan, repoRoot } from './bootstrap.mjs';
import { ACTIVATION_MIGRATION, dockerSqlTransport, runCelebrationsCutover, CutoverBlocked } from './celebrations-cutover.mjs';

// Accept only the generated local project identity. No connection URL, .env,
// credential or remote transport can be supplied to this bootstrap entrypoint.
export function preparedLocalActivation(workdir, root = repoRoot) {
  const plan = loadPlan(root);
  const stamp = JSON.parse(readFileSync(join(workdir, 'bootstrap.json'), 'utf8'));
  const signature = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const expectedProject = `biblioshare-local-${createHash('sha256').update(resolve(workdir)).digest('hex').slice(0, 8)}`;
  if (stamp.signature !== signature || stamp.projectId !== expectedProject) {
    throw new CutoverBlocked('Local bootstrap identity or sources differ; prepare a fresh disposable directory.');
  }
  const deferred = Array.isArray(stamp.migrations) ? stamp.migrations.filter((step) => step.deferred === true) : [];
  if (deferred?.length !== 1 || deferred[0].source !== `supabase/migrations/${ACTIVATION_MIGRATION.file}`) {
    throw new CutoverBlocked('Exactly the protected activation must be deferred.');
  }
  const index = plan.findIndex((step) => step.requiresCutover);
  const step = plan[index];
  const expectedVersion = String(20000101000000n + BigInt(index));
  const sourceSha = createHash('sha256').update(step.sql).digest('hex');
  if (deferred[0].version !== expectedVersion || deferred[0].sha256 !== sourceSha) {
    throw new CutoverBlocked('Deferred migration identity or SQL differs.');
  }
  const config = readFileSync(join(workdir, 'supabase/config.toml'), 'utf8');
  if (!config.split(/\r?\n/).includes(`project_id = "${expectedProject}"`)) {
    throw new CutoverBlocked('Generated local Supabase configuration identity differs.');
  }
  return { container: `supabase_db_${expectedProject}`, ledger: { version: expectedVersion, name: step.name },
    migrationPath: join(workdir, 'supabase/migrations', deferred[0].file), migrationSql: `-- Source: ${step.source}\n${step.sql}` };
}

async function cli() {
  const args = process.argv.slice(2);
  let workdir = resolve(repoRoot, '.superpowers/supabase-local');
  let privilegedDispatchPaused = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--privileged-dispatch-paused') privilegedDispatchPaused = true;
    else if (args[i] === '--workdir' && args[i + 1] && !args[i + 1].startsWith('--')) workdir = resolve(args[++i]);
    else throw new CutoverBlocked('Expected --workdir <prepared local directory> and --privileged-dispatch-paused.');
  }
  if (!privilegedDispatchPaused) throw new CutoverBlocked('Explicit privileged-dispatch pause attestation required.');
  const local = preparedLocalActivation(workdir);
  await runCelebrationsCutover({ ...dockerSqlTransport(local.container), ledger: local.ledger,
    privilegedDispatchPaused, onReceipt: (receipt) => console.log(JSON.stringify(receipt)) });
  // Only materialize after the protected DDL and its ledger entry committed.
  // The generated directory then matches the applied ordinal history. A direct
  // reset still has the real guard; it cannot replay an unaccredited activation.
  writeFileSync(local.migrationPath, local.migrationSql);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
}
