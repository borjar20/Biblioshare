import { expect, type Page } from '@playwright/test';
export type ComparisonActor = { id: string; email: string; password: string; name: string; username: string };
export type ComparisonFixture = { actors: ComparisonActor[]; books: { id: string; title: string; cover_url: string }[] };
const usernames = ['qa_comp_motion_a', 'qa_comp_motion_b', 'qa_comp_motion_c'];
const prefix = 'qa_comp_motion_';
function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!url || !['localhost', '127.0.0.1', 'tyvzpuhxfwxrnkcpzxyg.supabase.co'].includes(new URL(url).hostname)) throw new Error('Comparison fixtures require local/biblioshare-dev');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing server-only comparison fixture key');
  return { url, key };
}
async function request(path: string, init: RequestInit = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}/${path}`, { ...init, signal: AbortSignal.timeout(20_000), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) throw new Error(`Comparison fixture ${path.split('?')[0]}: HTTP ${response.status}`);
  return response;
}
export async function comparisonRest(path: string, init: RequestInit = {}) { return request(`rest/v1/${path}`, init); }
/** Exact disposable identities only. REST cleanup is independent of a disposed browser context. */
export async function clearComparisonFixtures() {
  env();
  const books = await (await comparisonRest(`books?title=like.${prefix}*&select=id,title`)).json() as { id: string; title: string }[];
  if (books.some(book => !/^qa_comp_motion_\d{2}$/.test(book.title))) throw new Error('Unrecognized comparison catalogue fixture');
  if (books.length) {
    const ids = books.map(book => book.id).join(',');
    await comparisonRest(`posts?anchor_id=in.(${ids})`, { method: 'DELETE' });
    await comparisonRest(`passes?item_id=in.(${ids})`, { method: 'DELETE' });
    await comparisonRest(`books?id=in.(${ids})&title=like.${prefix}*`, { method: 'DELETE' });
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
export async function withComparisonFixture<T>(body: (fixture: ComparisonFixture) => Promise<T>): Promise<T> {
  const failures: unknown[] = []; let value: T | undefined;
  try {
    await clearComparisonFixtures();
    const actors: ComparisonActor[] = [];
    for (const [index, username] of usernames.entries()) {
      const actor = { id: '', username, email: `${username}@example.invalid`, password: crypto.randomUUID(), name: ['Ana QA', 'Beatriz QA', 'Carlos QA'][index] };
      const data = await (await request('auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: actor.email, password: actor.password, email_confirm: true }) })).json() as { id: string };
      actor.id = data.id;
      await comparisonRest('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: actor.id, username, display_name: actor.name, is_public: true, onboarded_at: new Date().toISOString() }) });
      actors.push(actor);
    }
    await comparisonRest('follows', { method: 'POST', body: JSON.stringify(actors.slice(1).map(actor => ({ follower_id: actors[0].id, followee_id: actor.id, status: 'accepted' }))) });
    // Real catalogue cover URLs; duplicate only representation into disposable rows.
    const covers = await (await comparisonRest('books?cover_url=not.is.null&select=cover_url&limit=30')).json() as { cover_url: string }[];
    if (!covers.length) throw new Error('Comparison motion needs real cover assets in dev');
    const now = new Date().toISOString();
    const books = await (await comparisonRest('books', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Array.from({ length: 30 }, (_, index) => ({ title: `${prefix}${String(index).padStart(2, '0')}`, author: 'QA Comparison', total_pages: 300, cover_url: covers[index % covers.length].cover_url, hydrated_at: now, editions_synced_at: now }))) })).json() as ComparisonFixture['books'];
    await comparisonRest('passes', { method: 'POST', body: JSON.stringify(actors.flatMap(actor => books.map(book => ({ user_id: actor.id, item_type: 'book', item_id: book.id, status: 'completed', is_active: false, finished_on: '2026-09-01', rating: 9, is_public: true })))) });
    value = await body({ actors, books });
  } catch (error) { failures.push(error); }
  finally { try { await clearComparisonFixtures(); } catch (error) { failures.push(error); } }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Comparison setup/test/cleanup failures');
  return value as T;
}
export async function loginComparisonActor(page: Page, actor: ComparisonActor) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.locator('button[type="submit"]').click();
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


