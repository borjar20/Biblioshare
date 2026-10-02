/* #1290: synthetic external metadata only; actions, Auth and SQL stay real. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { appendFileSync, readFileSync } = require('node:fs');

if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) {
  throw new Error('Google volume hydration fixture requires disposable local Supabase');
}
const namespace = process.env.GOOGLE_VOLUME_HYDRATION_NAMESPACE;
const registry = process.env.GOOGLE_VOLUME_HYDRATION_FIXTURES;
const log = process.env.GOOGLE_VOLUME_HYDRATION_LOG;
if (!/^[0-9]{10,}$/.test(namespace || '') || !registry || !log) {
  throw new Error('Google volume hydration fixture requires its dedicated namespace, registry and log');
}
readFileSync(registry, 'utf8');
const originalFetch = globalThis.fetch;
let rpcCounter = 0;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPlEAAAAASUVORK5CYII=', 'base64');

function fixtures() {
  return readFileSync(registry, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(row => row.namespace === namespace && /^qa1290_[a-f0-9]{20}$/.test(row.marker || '')
      && typeof row.volumeId === 'string'
      && row.volumeId.startsWith(`gbhydrate1290_${namespace}_${row.marker}_`)
      && /^[A-Za-z0-9_-]+$/.test(row.volumeId) && /^\d{13}$/.test(row.isbn || ''));
}
function response(fixture, kind, body, status = 200) {
  // Do not retain query strings, API keys, request headers, credentials or RSC.
  appendFileSync(log, JSON.stringify({ namespace, marker: fixture.marker, volumeId: fixture.volumeId,
    kind, status, revision: fixture.revision, completedAt: new Date().toISOString() }) + '\n');
  return Response.json(body, { status });
}
function recordRpc(fixture, bookId, counter, phase, status) {
  // Observe only this fixture's real transaction, without retaining its
  // proposal, request headers, credentials or response body.
  try {
    appendFileSync(log, JSON.stringify({ namespace, marker: fixture.marker, volumeId: fixture.volumeId,
      kind: 'hydrate-rpc', revision: fixture.revision, bookId, counter, phase,
      ...(status === undefined ? {} : { status }) }) + '\n');
  } catch {
    // An observation failure must not alter the real request or response.
    // The test's missing completion barrier will fail instead.
  }
}
function ownedRpc(init) {
  const body = init?.body;
  if (typeof body !== 'string') return null;
  try {
    const proposal = JSON.parse(body);
    const bookId = proposal?.p_book_id;
    if (typeof bookId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bookId)) return null;
    const matches = fixtures().filter(fixture => {
      if (fixture.bookId === bookId) return true;
      // A fresh action has a database-generated UUID not known at registration.
      // Its exact namespace-owned title AND volume cover prove the proposal's
      // fixture; matching a title or an arbitrary UUID alone is insufficient.
      const title = proposal.p_fields?.title;
      const cover = proposal.p_fields?.cover;
      if (title?.source !== 'google_books' || title.value !== fixture.title || cover?.source !== 'google_books') return false;
      const expectedCover = new URL(fixture.cover);
      expectedCover.searchParams.set('zoom', '2'); expectedCover.searchParams.delete('edge');
      return cover.value === expectedCover.toString();
    });
    return matches.length === 1 ? { fixture: matches[0], bookId } : null;
  } catch {
    return null; // Unproven ownership passes through without observation.
  }
}
function volume(fixture, search = false) {
  return { id: fixture.volumeId, volumeInfo: {
    title: search ? fixture.searchTitle : fixture.title,
    authors: search ? ['Autor del resultado de búsqueda'] : fixture.authors,
    description: fixture.synopsis, language: fixture.language, pageCount: fixture.pages,
    imageLinks: { thumbnail: fixture.cover },
    industryIdentifiers: [{ type: 'ISBN_13', identifier: fixture.isbn }],
    // These fields deliberately exist in the provider but must not be copied
    // to GB-only book identity, year or genres by the hydration branch.
    publishedDate: '2039-11-20', categories: ['QA1290 forbidden category'],
  } };
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  if (method === 'POST' && url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL
      && url.pathname === '/rest/v1/rpc/hydrate_book') {
    const owned = ownedRpc(init);
    if (!owned) return originalFetch(input, init);
    const counter = ++rpcCounter;
    recordRpc(owned.fixture, owned.bookId, counter, 'start');
    try {
      const result = await originalFetch(input, init);
      // PostgREST sends its successful response after the transaction commits.
      // Return the original Response unchanged; never synthesize this RPC.
      recordRpc(owned.fixture, owned.bookId, counter, 'complete', result.status);
      return result;
    } catch (error) {
      recordRpc(owned.fixture, owned.bookId, counter, 'error');
      throw error;
    }
  }
  if (method !== 'GET' || url.protocol !== 'https:' || !['www.googleapis.com', 'openlibrary.org', 'inventaire.io', 'books.google.com'].includes(url.hostname)) {
    return originalFetch(input, init);
  }
  const owned = fixtures();
  const isbnLookup = url.hostname === 'openlibrary.org' && /^\/isbn\/(\d{13})\.json$/.exec(url.pathname);
  const isbnQuery = url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes'
    && /^isbn:(\d{13})$/.exec(url.searchParams.get('q') || '');
  const isbn = isbnLookup?.[1] || isbnQuery?.[1];
  const byIsbn = isbn && owned.find(row => row.isbn === isbn);
  if (byIsbn) {
    return isbnLookup
      ? response(byIsbn, 'isbn-openlibrary', { error: 'Owned synthetic ISBN absent from OpenLibrary' }, 404)
      : response(byIsbn, 'isbn-google', { totalItems: 1, items: [volume(byIsbn, true)] });
  }
  const detail = url.hostname === 'www.googleapis.com' && /^\/books\/v1\/volumes\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  const byId = detail && owned.find(row => row.volumeId === detail[1]);
  if (byId) {
    appendFileSync(log, JSON.stringify({ namespace, marker: byId.marker, volumeId: byId.volumeId,
      kind: 'volume-detail-start', revision: byId.revision }) + '\n');
    if (byId.delayMs) await new Promise(resolve => setTimeout(resolve, byId.delayMs));
    return byId.mode === 'http503'
      ? response(byId, 'volume-detail', { error: 'Owned synthetic provider unavailable' }, 503)
      : response(byId, 'volume-detail', volume(byId));
  }
  const work = url.hostname === 'openlibrary.org' && /^\/works\/(OL\d+W)(\.json|\/editions\.json)$/.exec(url.pathname);
  const byWork = work && owned.find(row => row.workKey === work[1]);
  if (byWork) {
    if (work[2] === '/editions.json') return response(byWork, 'openlibrary-editions', { size: 0, entries: [] });
    return response(byWork, 'openlibrary-work', { title: byWork.openLibraryTitle,
      description: byWork.openLibrarySynopsis, authors: [], covers: [], subjects: [], first_publish_date: '2024' });
  }
  // Credit enrichment remains legitimate after the detail renders. Match its
  // exact owned title/first-author pair rather than simulating an OL identity.
  if (url.hostname === 'openlibrary.org' && url.pathname === '/search.json'
      && url.searchParams.get('limit') === '1'
      && url.searchParams.get('fields') === 'key,title,author_name,author_key') {
    const credits = owned.find(row => [
      { title: row.title, author: row.authors?.[0] || null },
      ...(row.alternateTitles || []).map((title, index) => ({ title, author: row.alternateAuthors?.[index] || null })),
    ].some(pair => url.searchParams.get('title') === pair.title
      && url.searchParams.get('author') === pair.author));
    if (credits) return response(credits, 'openlibrary-credit-search', { docs: [] });
  }
  const byText = owned.find(row => [row.title, ...(row.alternateTitles || []), row.openLibraryTitle].filter(Boolean)
    .some(title => url.hostname === 'inventaire.io' && url.pathname === '/api/search'
      ? url.searchParams.get('search') === title
      : url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes'
        && (url.searchParams.get('q') === `intitle:${title}`
          || (row.alternateAuthors || []).some(author => url.searchParams.get('q') === `intitle:${title} inauthor:${author}`))));
  if (byText) return response(byText, url.hostname === 'inventaire.io' ? 'inventaire' : 'google-text',
    url.hostname === 'inventaire.io' ? { results: [] } : { items: [] });
  if (url.hostname === 'books.google.com' && url.pathname === '/books/content') {
    const cover = owned.find(row => row.volumeId === url.searchParams.get('id'));
    if (cover) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  }
  return originalFetch(input, init);
};
