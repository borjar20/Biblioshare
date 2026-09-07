import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, loadPlan } from './bootstrap.mjs';
import { verifyQuotaConcurrency } from './verify-quota-concurrency.mjs';
import { verifyCatalogReferenceConcurrency } from './verify-catalog-reference-concurrency.mjs';

// Only the disposable container named by this checkout's generated manifest.
const stamp = JSON.parse(readFileSync(join(repoRoot, '.superpowers/supabase-local/bootstrap.json'), 'utf8'));
assert.match(stamp.projectId, /^biblioshare-local-[a-f0-9]{8}$/);
function sql(query) {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${stamp.projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' }).trim();
}
const versions = sql('select version from supabase_migrations.schema_migrations order by version;').split('\n').map((v) => v.trim());
assert.equal(stamp.migrations.length, loadPlan().length);
assert.deepEqual(versions, stamp.migrations.map((migration) => migration.version));
sql(readFileSync(join(repoRoot, 'scripts/db/verify.sql'), 'utf8'));
sql(readFileSync(join(repoRoot, 'supabase/tests/pass_interaction_hrefs.sql'), 'utf8'));
sql(readFileSync(join(repoRoot, 'supabase/tests/catalog_technical_gate.sql'), 'utf8'));
sql(readFileSync(join(repoRoot, 'supabase/tests/shared_rate_limits.sql'), 'utf8'));
sql(readFileSync(join(repoRoot, 'supabase/tests/catalog_reference_guards.sql'), 'utf8'));
await verifyQuotaConcurrency(stamp.projectId);
await verifyCatalogReferenceConcurrency(stamp.projectId);
console.log(`PASS: ${versions.length} bootstrap steps, schema contracts and role privileges.`);
