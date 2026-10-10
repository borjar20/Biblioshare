import { expect, type Page } from '@playwright/test';
import { visibleFormContaining } from './visible-form';
export type ComparisonActor = { id: string; email: string; password: string; name: string; username: string };
export type ComparisonFixture = { actors: ComparisonActor[]; books: { id: string; title: string; cover_url: string }[]; movie?: { id: string; title: string }; series?: { id: string; title: string }; volumeCount?: number };
const usernames = Array.from({ length: 10 }, (_, index) => `qa_comp_motion_${String.fromCharCode(97 + index)}`);
const prefix = 'qa_comp_motion_';
function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!url || !(new URL(url).origin === 'http://127.0.0.1:54321' || new URL(url).origin === 'http://localhost:54321' || new URL(url).origin === 'https://tyvzpuhxfwxrnkcpzxyg.supabase.co')) throw new Error('Comparison fixtures require local/biblioshare-dev');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing server-only comparison fixture key');
  return { url, key };
}
async function request(path: string, init: RequestInit = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}/${path}`, { ...init, signal: AbortSignal.timeout(20_000), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
    throw new Error(`Comparison fixture ${path.split('?')[0]}: HTTP ${response.status}; ${error.code ?? ''} ${error.message ?? ''}`);
  }
  return response;
}
export async function comparisonRest(path: string, init: RequestInit = {}) { return request(`rest/v1/${path}`, init); }
/** Exact disposable identities only. REST cleanup is independent of a disposed browser context. */
export async function clearComparisonFixtures() {
  env();
  const books: { id: string; title: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await comparisonRest(`books?title=like.${prefix}*&select=id,title&order=id&limit=1000&offset=${offset}`)).json() as typeof books;
    books.push(...page); if (page.length < 1000) break;
  }
  if (books.some(book => !/^qa_comp_motion_(?:\d{2}|volume_\d{4}|long_.+)$/.test(book.title))) throw new Error('Unrecognized comparison catalogue fixture');
  for (let offset = 0; offset < books.length; offset += 100) {
    const ids = books.slice(offset, offset + 100).map(book => book.id).join(',');
    await comparisonRest(`posts?anchor_id=in.(${ids})`, { method: 'DELETE' });
    await comparisonRest(`passes?item_id=in.(${ids})`, { method: 'DELETE' });
    await comparisonRest(`books?id=in.(${ids})&title=like.${prefix}*`, { method: 'DELETE' });
  }
  for (const table of ['movies', 'series']) {
    const rows = await (await comparisonRest(`${table}?title=like.${prefix}*&select=id,title`)).json() as { id: string; title: string }[];
    if (rows.some(row => !['qa_comp_motion_movie', 'qa_comp_motion_long_series_El relato extraordinariamente largo de una biblioteca compartida y sus episodios'].includes(row.title))) throw new Error('Unrecognized comparison media fixture');
    for (const row of rows) {
      await comparisonRest(`posts?anchor_id=eq.${row.id}`, { method: 'DELETE' });
      await comparisonRest(`passes?item_id=eq.${row.id}`, { method: 'DELETE' });
      await comparisonRest(`${table}?id=eq.${row.id}&title=like.${prefix}*`, { method: 'DELETE' });
    }
  }
  // Auth pagination also catches a partial seed that died before creating profiles.
  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const data = await (await request(`auth/v1/admin/users?page=${page}&per_page=100`)).json() as { users: { id: string; email: string }[] };
    users.push(...data.users.filter(user => usernames.some(username => user.email === `${username}@example.invalid`)));
    if (data.users.length < 100) break;
  }
  for (const user of users) {
    await comparisonRest(`comparison_groups?owner_id=eq.${user.id}`, { method: 'DELETE' });
    await request(`auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
  }
  expect(await (await comparisonRest(`profiles?username=in.(${usernames.join(',')})&select=user_id`)).json(), 'disposable profiles removed').toEqual([]);
  expect(await (await comparisonRest(`books?title=like.${prefix}*&select=id`)).json(), 'disposable books removed').toEqual([]);
}
export async function withComparisonFixture<T>(body: (fixture: ComparisonFixture) => Promise<T>, options: { integrated?: boolean; volume?: boolean } = {}): Promise<T> {
  const failures: unknown[] = []; let value: T | undefined;
  try {
    await clearComparisonFixtures();
    const actors: ComparisonActor[] = [];
    if (options.volume && !['127.0.0.1', 'localhost'].includes(new URL(env().url).hostname)) throw new Error('Volume fixture is LOCAL ONLY');
    for (const [index, username] of usernames.slice(0, options.integrated ? 10 : 3).entries()) {
      const actor = { id: '', username, email: `${username}@example.invalid`, password: crypto.randomUUID(), name: ['Ana QA', 'Beatriz QA', 'Carlos QA', 'Diana Ana QA', 'Eva QA', 'Felipe QA', 'Gloria QA', 'Hugo QA', 'Irene QA', 'Luis QA'][index] };
      const data = await (await request('auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: actor.email, password: actor.password, email_confirm: true }) })).json() as { id: string };
      actor.id = data.id;
      await comparisonRest('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: actor.id, username, display_name: actor.name, is_public: index !== 1, onboarded_at: new Date().toISOString() }) });
      actors.push(actor);
    }
    await comparisonRest('follows', { method: 'POST', body: JSON.stringify(actors.slice(1).map(actor => ({ follower_id: actors[0].id, followee_id: actor.id, status: 'accepted' }))) });
    // Real catalog bytes are stored in the suite and served by an asset-only route.
    const covers = [{ cover_url: 'https://comparison-fixture.invalid/catalog-cover.jpg' }];
    const now = new Date().toISOString();
    const books = await (await comparisonRest('books', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Array.from({ length: 30 }, (_, index) => ({ title: `${prefix}${String(index).padStart(2, '0')}`, author: 'QA Comparison', total_pages: 300, cover_url: covers[index % covers.length].cover_url, genres: ['Drama'], hydrated_at: now, editions_synced_at: now }))) })).json() as ComparisonFixture['books'];
    await comparisonRest('passes', { method: 'POST', body: JSON.stringify(actors.flatMap((actor, index) => (index < 3 ? books : books.slice(0, 3)).map(book => ({ user_id: actor.id, item_type: 'book', item_id: book.id, status: 'completed', is_active: false, finished_on: '2026-09-01', rating: 9, is_public: true })))) });
    let movie: ComparisonFixture['movie'], series: ComparisonFixture['series'];
    if (options.integrated) {
      await comparisonRest('passes', { method: 'POST', body: JSON.stringify({ user_id: actors[0].id, item_type: 'book', item_id: books[0].id, status: 'completed', is_active: false, rating: null, finished_on: '2026-10-01', is_public: true }) });
      movie = (await (await comparisonRest('movies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: 'qa_comp_motion_movie', cover_url: covers[0].cover_url, genres: ['Drama'] }) })).json())[0];
      series = (await (await comparisonRest('series', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: 'qa_comp_motion_long_series_El relato extraordinariamente largo de una biblioteca compartida y sus episodios', cover_url: covers[0].cover_url, genres: ['Drama'], tmdb_status: 'Ended' }) })).json())[0];
      await comparisonRest('passes', { method: 'POST', body: JSON.stringify(actors.slice(0, 3).flatMap(actor => [
        { user_id: actor.id, item_type: 'movie', item_id: movie!.id, status: 'completed', is_active: false, rating: 8, finished_on: '2026-09-01', is_public: true, review: 'PRIVATE PASS QA MUST NOT LEAVE' },
        { user_id: actor.id, item_type: 'series', item_id: series!.id, status: actor.id === actors[0].id ? 'completed' : 'dropped', is_active: true, rating: 6, finished_on: '2026-09-01', is_public: true, review: null },
      ])) });
      await comparisonRest('series_episodes', { method: 'POST', body: JSON.stringify(Array.from({ length: 40 }, (_, index) => ({ series_id: series!.id, season_number: 1, episode_number: index + 1, air_date: '2020-01-01' }))) });
      await comparisonRest('episode_watches', { method: 'POST', body: JSON.stringify(actors.slice(0, 3).flatMap(actor => Array.from({ length: 40 }, (_, index) => ({ user_id: actor.id, series_id: series!.id, pass_id: null, season_number: 1, episode_number: index + 1, watched_on: '2026-09-01', rating: 9, review: 'PRIVATE EPISODE QA MUST NOT LEAVE' })))) });
    }
    if (options.volume) {
      // 1,205 historical book passes for the private one-way followed member.
      const extra = Array.from({ length: 1175 }, (_, index) => ({ id: crypto.randomUUID(), title: `${prefix}volume_${String(index).padStart(4, '0')}`, genres: ['Drama'] }));
      for (let offset = 0; offset < extra.length; offset += 100) {
        const batch = extra.slice(offset, offset + 100);
        await comparisonRest('books', { method: 'POST', body: JSON.stringify(batch) });
        await comparisonRest('passes', { method: 'POST', body: JSON.stringify(batch.map(book => ({ user_id: actors[1].id, item_type: 'book', item_id: book.id, status: 'completed', is_active: false, rating: 8, finished_on: '2026-09-01', review: 'PRIVATE VOLUME QA MUST NOT LEAVE' }))) });
      }
    }
    value = await body({ actors, books, movie, series, volumeCount: options.volume ? 1205 : undefined });
  } catch (error) { failures.push(error); }
  finally { try { await clearComparisonFixtures(); } catch (error) { failures.push(error); } }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Comparison setup/test/cleanup failures');
  return value as T;
}
export async function loginComparisonActor(page: Page, actor: ComparisonActor) {
  await page.context().route('https://comparison-fixture.invalid/catalog-cover.jpg', route => route.fulfill({ path: 'e2e/fixtures/comparisons/catalog-cover.jpg', contentType: 'image/jpeg' }));
  await page.goto('/login');
  const form = visibleFormContaining(page, 'input[name="email"]');
  await form.locator('input[name="email"]:visible').fill(actor.email);
  await form.locator('input[name="password"]:visible').fill(actor.password);
  await form.locator('button[type="submit"]:visible').click();
  await expect(page).not.toHaveURL(/\/login/);
}
export async function openComparisonFixture(page: Page, fixture: ComparisonFixture) {
  await loginComparisonActor(page, fixture.actors[0]);
  await page.goto('/comunidad/entre-nosotros');
  await page.getByRole('button', { name: 'Crear grupo', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear grupo' });
  await form.getByLabel('Nombre del grupo').fill('qa_comp_motion');
  for (const actor of fixture.actors) await form.getByRole('checkbox', { name: actor.name, exact: true }).check();
  await form.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await expect(page.locator('[data-camera-moving][data-view="group"]')).toBeVisible();
  return page.locator('[data-camera-moving]');
}



export async function deleteComparisonActor(actor: ComparisonActor) {
  if (!usernames.includes(actor.username) || actor.email !== `${actor.username}@example.invalid`) throw new Error('Not an owned disposable actor');
  await request(`auth/v1/admin/users/${actor.id}`, { method: 'DELETE' });
}
