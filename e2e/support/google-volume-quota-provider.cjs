/* External-provider fixture for #1237. Actions, Auth and SQL remain real. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs');

if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) {
  throw new Error('Google volume quota fixture requires disposable local Supabase');
}
const namespace = process.env.GOOGLE_VOLUME_QUOTA_NAMESPACE;
const registry = process.env.GOOGLE_VOLUME_QUOTA_FIXTURES;
if (!/^[0-9]{10,}$/.test(namespace || '') || !registry) {
  throw new Error('Google volume quota fixture requires a namespace and metadata registry');
}
// Validate the file before the server starts. It contains synthetic metadata only.
readFileSync(registry, 'utf8');
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const openLibrary = url.hostname === 'openlibrary.org' && /^\/isbn\/(\d{13})\.json$/.exec(url.pathname);
  const googleBooks = url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes'
    && /^isbn:(\d{13})$/.exec(url.searchParams.get('q') || '');
  const googleDetail = url.hostname === 'www.googleapis.com'
    && (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase() === 'GET'
    && /^\/books\/v1\/volumes\/(gbquota1237_[A-Za-z0-9_-]+)$/.exec(url.pathname);
  const isbn = openLibrary?.[1] || googleBooks?.[1];
  if (isbn || googleDetail) {
    const fixture = readFileSync(registry, 'utf8').split('\n').filter(Boolean)
      .map(line => JSON.parse(line))
      .find(row => row.namespace === namespace && (isbn ? row.isbn === isbn : row.volumeId === googleDetail[1])
        && /^\d{13}$/.test(row.isbn)
        && row.volumeId.startsWith(`gbquota1237_${namespace}_`));
    if (fixture) {
      if (googleDetail) return Response.json({ id: fixture.volumeId, volumeInfo: {
        title: fixture.title, authors: ['Autor sintético QA1237'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: fixture.isbn }],
      } });
      return openLibrary
        ? Response.json({ error: 'Synthetic ISBN absent from OpenLibrary' }, { status: 404 })
        : Response.json({ totalItems: 1, items: [{ id: fixture.volumeId, volumeInfo: {
          title: fixture.title, authors: ['Autor sintético QA1237'],
          industryIdentifiers: [{ type: 'ISBN_13', identifier: fixture.isbn }],
        } }] });
    }
  }
  return originalFetch(input, init);
};
