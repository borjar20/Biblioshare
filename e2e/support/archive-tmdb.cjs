// Local-only external API fixture. Loaded explicitly by the archive test server.
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) {
  throw new Error('Archive TMDB fixture requires disposable local Supabase');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'api.themoviedb.org') return originalFetch(input, init);
  const film = { id: 90000001, title: 'Archive Fiction', original_title: 'Archive Fiction', release_date: '2020-01-01', poster_path: null, runtime: 90, overview: 'Synthetic fixture', genres: [], credits: { crew: [] } };
  if (url.pathname.includes('/search/movie')) return Response.json({ results: url.searchParams.get('query') === 'Archive Fiction' ? [film] : [], total_pages: 1 });
  return Response.json(film);
};
