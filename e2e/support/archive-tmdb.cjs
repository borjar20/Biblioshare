// Local-only external API fixture. Loaded explicitly by the archive test server.
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) {
  throw new Error('Archive TMDB fixture requires disposable local Supabase');
}
const originalFetch = globalThis.fetch;
const recoveryAttempts = new Map();
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'image.tmdb.org' && url.pathname.includes('synthetic-')) return new Response(require('./archive-poster.cjs')(url.pathname.includes('comedy')), { headers: { 'Content-Type': 'image/png' } });
  if (url.hostname !== 'api.themoviedb.org') return originalFetch(input, init);
  const query = url.searchParams.get('query') || '';
  const recoveryIndex = /^Archive Recovery (\d+)$/.exec(query)?.[1];
  const detailIndex = /^\/3\/movie\/(9000[1-9]\d{3})$/.exec(url.pathname)?.[1];
  if (recoveryIndex !== undefined || detailIndex !== undefined) {
    const index = recoveryIndex !== undefined ? Number(recoveryIndex) : Number(detailIndex) - 90001000;
    if (detailIndex !== undefined) {
      const attempt = (recoveryAttempts.get(index) || 0) + 1;
      recoveryAttempts.set(index, attempt);
      if (index === 0 && attempt === 1) return new Response('', { status: 503 });
      if (index === 1) return new Response('', { status: 404 });
    }
    const recoveryFilm = { id: 90001000 + index, title: `Archive Recovery ${index}`, original_title: `Archive Recovery ${index}`,
      release_date: '2020-01-01', poster_path: '/synthetic-recovery.png', runtime: 90 + index % 20, overview: `Synthetic synopsis ${index}`,
      genres: [{ id: 18 }], genre_ids: [18], credits: { crew: [{ id: 123, name: `Director ${index}`, job: 'Director' }] } };
    if (recoveryIndex !== undefined && index === 27) return Response.json({ results: [recoveryFilm,
      { ...recoveryFilm, id: 90001945, genre_ids: [35], poster_path: '/synthetic-comedy.png' }], total_pages: 1 });
    return Response.json(url.pathname.includes('/search/') ? { results: [recoveryFilm], total_pages: 1 } : recoveryFilm);
  }
  const film = { id: 90000001, title: 'Archive Fiction', original_title: 'Archive Fiction', release_date: '2020-01-01', poster_path: null, runtime: 90, overview: 'Synthetic fixture', genres: [], credits: { crew: [] } };
  if (url.pathname.includes('/search/movie')) return Response.json({ results: url.searchParams.get('query') === 'Archive Fiction' ? [film] : [], total_pages: 1 });
  return Response.json(film);
};
