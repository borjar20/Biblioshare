import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sleepSeconds = 1.8;
let projectId;
let evidencePath;
let actorId;
let fixtureBooks;
let results;

function quote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function sql(query) {
  return (await run('docker', [
    'exec', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', '-c', query,
  ], { encoding: 'utf8', timeout: 15_000, windowsHide: true })).stdout.trim();
}

function volumeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function editionId(output) {
  const id = output.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
  assert.ok(id, `RPC returned no UUID: ${output}`);
  return id;
}

async function waitForSleep(labels) {
  const wanted = labels.map(quote).join(', ');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const sleeping = await sql(`select count(*) from pg_stat_activity where application_name in (${wanted}) and wait_event = 'PgSleep';`);
    if (Number(sleeping) === labels.length) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Controlled overlap was not observed for ${labels.join(', ')}`);
}

function rpc(bookId, actorId, isbn) {
  return `select public.register_verified_book_edition(${quote(bookId)}::uuid, ${quote(actorId)}::uuid, ${quote(isbn)}, '[TEST #906] concurrent RPC');`;
}

function directInsert(bookId, actorId, isbn) {
  return `insert into public.book_editions(book_id, label, isbn, created_by)
    values (${quote(bookId)}::uuid, '[TEST #906] concurrent direct', ${quote(isbn)}, ${quote(actorId)}::uuid)
    returning id;`;
}

function heldRpc(label, bookId, actorId, isbn) {
  return `set application_name = ${quote(label)}; begin transaction isolation level read committed;
    ${rpc(bookId, actorId, isbn)} select pg_sleep(${sleepSeconds}); commit;`;
}

function repeatableWriter(label, bookId, actorId, isbn, writer) {
  return `set application_name = ${quote(label)}; begin transaction isolation level repeatable read;
    select count(*) from public.book_editions where book_id = ${quote(bookId)}::uuid;
    select pg_sleep(0.25); ${writer(bookId, actorId, isbn)} commit;`;
}

async function assertSingleAdmission(bookId, isbn) {
  const [rows, ledgerRows, ledgerCount] = (await sql(`select
    (select count(*) from public.book_editions where book_id = ${quote(bookId)}::uuid and public.canonical_isbn13(isbn) = ${quote(isbn)}),
    (select count(*) from private.book_edition_isbn_keys where book_id = ${quote(bookId)}::uuid and isbn13 = ${quote(isbn)}),
    coalesce((select row_count from private.book_edition_isbn_keys where book_id = ${quote(bookId)}::uuid and isbn13 = ${quote(isbn)}), -1);`)).split('|').map(Number);
  assert.deepEqual([rows, ledgerRows, ledgerCount], [1, 1, 1], 'one edition and one matching ledger key must remain');
}

function expectedConflict(result) {
  assert.equal(result.status, 'rejected', 'the second repeatable-read writer must not commit');
  const detail = `${result.reason.stdout ?? ''}\n${result.reason.stderr ?? ''}`;
  assert.match(detail, /23505|40001/, `expected 23505 or 40001, got: ${detail}`);
  return detail.match(/23505|40001/)?.[0];
}

async function runCase(name, action) {
  const startedAt = new Date().toISOString();
  try {
    const details = await action();
    results.push({ name, status: 'PASS', startedAt, finishedAt: new Date().toISOString(), ...details });
    console.log(`PASS #906 ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', startedAt, finishedAt: new Date().toISOString(), error: String(error) });
    throw error;
  }
}

const canonicalIsbn = '9788433920423';
const equivalentIsbn10 = '8433920421';

async function newBook(name) {
  const bookId = randomUUID();
  fixtureBooks.push(bookId);
  await sql(`insert into public.books(id, title) values (${quote(bookId)}::uuid, ${quote(`[TEST #906] ${name}`)});`);
  return bookId;
}

export async function verifyBookEditionIsbnConcurrency(localProjectId, localEvidencePath) {
  assert.match(localProjectId ?? '', /^biblioshare-local-[a-f0-9]{8}$/, 'pass a generated local project id');
  projectId = localProjectId;
  evidencePath = localEvidencePath;
  actorId = randomUUID();
  fixtureBooks = [];
  results = [];

try {
  await sql(`insert into auth.users(id, aud, role, email, created_at, updated_at)
    values (${quote(actorId)}::uuid, 'authenticated', 'authenticated', ${quote(`canonical-isbn-concurrency-${actorId}@example.test`)}, now(), now());`);

  await runCase('READ COMMITTED RPC/RPC returns one non-null edition id', async () => {
    const bookId = await newBook('rc rpc-rpc');
    const label = volumeId('isbn906_rc_rpc_a');
    const first = sql(heldRpc(label, bookId, actorId, canonicalIsbn));
    await waitForSleep([label]);
    const second = sql(rpc(bookId, actorId, equivalentIsbn10));
    const [a, b] = await Promise.all([first, second]);
    assert.equal(editionId(a), editionId(b), 'both RPC calls must return the same edition id');
    await assertSingleAdmission(bookId, canonicalIsbn);
  });

  await runCase('READ COMMITTED RPC/direct insert admits one row', async () => {
    const bookId = await newBook('rc rpc-direct');
    const label = volumeId('isbn906_rc_direct_a');
    const first = sql(heldRpc(label, bookId, actorId, canonicalIsbn));
    await waitForSleep([label]);
    const second = sql(directInsert(bookId, actorId, equivalentIsbn10));
    const [a, b] = await Promise.allSettled([first, second]);
    assert.equal(a.status, 'fulfilled');
    expectedConflict(b);
    await assertSingleAdmission(bookId, canonicalIsbn);
  });

  for (const [name, writer] of [
    ['REPEATABLE READ RPC/RPC rejects the stale second snapshot', rpc],
    ['REPEATABLE READ RPC/direct insert rejects the stale second snapshot', directInsert],
  ]) {
    await runCase(name, async () => {
      const bookId = await newBook(name);
      const firstLabel = volumeId('isbn906_rr_a');
      const secondLabel = volumeId('isbn906_rr_b');
      const first = sql(heldRpc(firstLabel, bookId, actorId, canonicalIsbn));
      await waitForSleep([firstLabel]);
      const second = sql(repeatableWriter(secondLabel, bookId, actorId, equivalentIsbn10, writer));
      // The second session has completed a SELECT (its RR snapshot) before its
      // observed sleep, while the first is still sleeping before COMMIT.
      await waitForSleep([firstLabel, secondLabel]);
      const [a, b] = await Promise.allSettled([first, second]);
      assert.equal(a.status, 'fulfilled');
      const sqlstate = expectedConflict(b);
      await assertSingleAdmission(bookId, canonicalIsbn);
      return { expectedSqlstate: sqlstate };
    });
  }

  await runCase('DELETE CASCADE releases the admission key', async () => {
    const bookId = await newBook('delete cascade');
    await sql(rpc(bookId, actorId, canonicalIsbn));
    await assertSingleAdmission(bookId, canonicalIsbn);
    await sql(`delete from public.books where id = ${quote(bookId)}::uuid;`);
    const [books, keys] = (await sql(`select
      (select count(*) from public.books where id = ${quote(bookId)}::uuid),
      (select count(*) from private.book_edition_isbn_keys where book_id = ${quote(bookId)}::uuid);`)).split('|').map(Number);
    assert.deepEqual([books, keys], [0, 0], 'deleting the parent must cascade through the edition and its ledger key');
  });
} finally {
  // Delete editions before their books: this is the normal application-level
  // release path for the admission key, and lets cleanup assert that the key
  // truly returns to zero without relying on FK cascade ordering.
  const editionDeletes = await Promise.allSettled(fixtureBooks.map((bookId) => sql(`delete from public.book_editions where book_id = ${quote(bookId)}::uuid;`)));
  const bookDeletes = await Promise.allSettled(fixtureBooks.map((bookId) => sql(`delete from public.books where id = ${quote(bookId)}::uuid;`)));
  for (const deletion of [...editionDeletes, ...bookDeletes]) assert.equal(deletion.status, 'fulfilled', 'fixture cleanup command failed');
  await sql(`delete from auth.users where id = ${quote(actorId)}::uuid;`);
  const fixtureIds = fixtureBooks.map((bookId) => `${quote(bookId)}::uuid`).join(', ') || 'null';
  const [editions, books, keys, users] = (await sql(`select
    (select count(*) from public.book_editions where book_id in (${fixtureIds})),
    (select count(*) from public.books where id in (${fixtureIds})),
    (select count(*) from private.book_edition_isbn_keys where book_id in (${fixtureIds})),
    (select count(*) from auth.users where id = ${quote(actorId)}::uuid);`)).split('|').map(Number);
  assert.deepEqual([editions, books, keys, users], [0, 0, 0, 0], 'all edition, book, ledger, and auth fixtures must be removed');
  if (evidencePath) {
    const destination = resolve(evidencePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify({ issue: 906, projectId, results, cleanup: 'PASS' }, null, 2)}\n`, 'utf8');
  }
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyBookEditionIsbnConcurrency(
    process.argv[2] ?? process.env.SUPABASE_LOCAL_PROJECT_ID,
    process.env.EVIDENCE_FILE ?? process.argv[3],
  );
}

