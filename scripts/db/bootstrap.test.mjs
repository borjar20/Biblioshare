import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { loadPlan, prepare, repoRoot, renderBaseline } from './bootstrap.mjs';

function fixture(body) {
  const root = mkdtempSync(join(tmpdir(), 'biblioshare-bootstrap-'));
  try {
    mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
    mkdirSync(join(root, 'supabase/bootstrap'), { recursive: true });
    writeFileSync(join(root, 'supabase/bootstrap/initial.sql'), 'select 1;');
    writeFileSync(join(root, 'supabase/migrations/20260101_a.sql'), 'select 2;');
    writeFileSync(join(root, 'supabase/bootstrap/manifest.json'), JSON.stringify({ version: 1, migrations: ['20260101_a.sql'] }));
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('every repository migration is included exactly once', () => {
  assert.ok(loadPlan(repoRoot).length > 200);
});
test('the psql entrypoint has the same complete ordering as the CLI bootstrap', () => {
  assert.equal(readFileSync(join(repoRoot, 'supabase/schema-baseline.sql'), 'utf8').replaceAll('\r\n', '\n'), renderBaseline());
});
test('an added migration must be placed in the explicit order', () => fixture((root) => {
  writeFileSync(join(root, 'supabase/migrations/20260102_new.sql'), 'select 3;');
  assert.throws(() => loadPlan(root), /Migration inventory differs.*20260102_new/);
}));
test('duplicate manifest entries fail before any SQL is generated', () => fixture((root) => {
  writeFileSync(join(root, 'supabase/bootstrap/manifest.json'), JSON.stringify({ version: 1, migrations: ['20260101_a.sql', '20260101_a.sql'] }));
  assert.throws(() => loadPlan(root), /Duplicate migration/);
}));
test('source changes cannot silently reuse an old generated history', () => fixture((root) => {
  const destination = join(root, 'generated');
  const first = prepare(root, destination);
  assert.deepEqual(prepare(root, destination), first);
  writeFileSync(join(root, 'supabase/migrations/20260101_a.sql'), 'select 99;');
  assert.throws(() => prepare(root, destination), /sources changed/);
}));
test('duplicate historical timestamps receive distinct local ledger versions', () => fixture((root) => {
  writeFileSync(join(root, 'supabase/migrations/20260101_b.sql'), 'select 3;');
  writeFileSync(join(root, 'supabase/bootstrap/manifest.json'), JSON.stringify({ version: 1, migrations: ['20260101_a.sql', '20260101_b.sql'] }));
  const destination = join(root, 'generated');
  prepare(root, destination);
  const { migrations } = JSON.parse(readFileSync(join(destination, 'bootstrap.json'), 'utf8'));
  assert.equal(new Set(migrations.map((step) => step.version)).size, 3);
  assert.ok(migrations[1].source.endsWith('20260101_a.sql'));
  assert.ok(migrations[2].source.endsWith('20260101_b.sql'));
}));

test('foreign destinations and unlisted generated SQL are rejected', () => fixture((root) => {
  const foreign = join(root, 'foreign');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'keep.txt'), 'keep');
  assert.throws(() => prepare(root, foreign), /non-bootstrap directory/);
  const destination = join(root, 'generated');
  prepare(root, destination);
  writeFileSync(join(destination, 'supabase/migrations/99999999999999_extra.sql'), 'select 99;');
  assert.throws(() => prepare(root, destination), /Unexpected file/);
}));
