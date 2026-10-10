import type {
  AiredCount, EpisodeNote, Facts, PassRow, PersonWork, WatchRow, WorkDetail, WorkKey,
} from './types';

function workKey(type: PassRow['item_type'], id: string): WorkKey {
  return `${type}:${id}`;
}

function sortPasses(a: PassRow, b: PassRow): number {
  return (b.finished_on ?? '').localeCompare(a.finished_on ?? '') ||
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

function sortWatches(a: WatchRow, b: WatchRow): number {
  return b.watched_on.localeCompare(a.watched_on) ||
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

function episodeId(season: number, episode: number): string {
  return `${season}:${episode}`;
}

function numberedEpisodes(watches: WatchRow[]): EpisodeNote[] {
  const latest = new Map<string, WatchRow>();
  for (const row of watches.toSorted(sortWatches)) {
    const id = episodeId(row.season_number, row.episode_number);
    if (!latest.has(id)) latest.set(id, row);
  }
  return [...latest.values()]
    .toSorted((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number)
    .map((row) => ({ season: row.season_number, episode: row.episode_number, rating: row.rating }));
}

export function normalize(passes: PassRow[], watches: WatchRow[], aired: AiredCount[]): Facts {
  const passGroups = new Map<string, PassRow[]>();
  const watchGroups = new Map<string, WatchRow[]>();
  for (const row of passes) {
    const id = `${row.user_id}|${workKey(row.item_type, row.item_id)}`;
    const group = passGroups.get(id) ?? [];
    group.push(row);
    passGroups.set(id, group);
  }
  for (const row of watches) {
    const id = `${row.user_id}|series:${row.series_id}`;
    const group = watchGroups.get(id) ?? [];
    group.push(row);
    watchGroups.set(id, group);
  }

  const airedBySeries = new Map(aired.map((row) => [row.seriesId, row.count]));
  const episodes: Facts['episodes'] = {};
  const works: PersonWork[] = [];
  let excludedSeriesWithoutEpisodes = 0;
  const keys = new Set([...passGroups.keys(), ...watchGroups.keys()]);

  for (const id of keys) {
    const history = passGroups.get(id) ?? [];
    const seen = watchGroups.get(id) ?? [];
    const sample = history[0];
    const userId = sample?.user_id ?? seen[0].user_id;
    const key = sample ? workKey(sample.item_type, sample.item_id) : `series:${seen[0].series_id}` as WorkKey;

    if (!key.startsWith('series:')) {
      const completed = history.filter((row) => row.status === 'completed').toSorted(sortPasses);
      if (completed.length === 0) continue;
      works.push({ userId, key, rating: completed[0].rating,
        orderUnknown: completed.length > 1 && completed.some((row) => row.finished_on === null),
        progress: null });
      continue;
    }

    if (seen.length === 0) {
      if (history.some((row) => row.status !== 'planned')) excludedSeriesWithoutEpisodes++;
      continue;
    }

    const notes = numberedEpisodes(seen);
    episodes[id] = notes;
    const activeInProgress = history.filter((row) => row.is_active && row.status === 'in_progress')
      .toSorted((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    const closed = history.filter((row) => row.status === 'completed' || row.status === 'dropped')
      .toSorted(sortPasses);
    const general = activeInProgress ?? closed[0] ?? null;
    const active = history.filter((row) => row.is_active && row.status !== 'planned')
      .toSorted((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    const current = active ? numberedEpisodes(seen.filter((row) => row.pass_id === active.id)).length : null;
    const seriesId = key.slice('series:'.length);
    works.push({ userId, key, rating: general?.rating ?? null,
      orderUnknown: !activeInProgress && closed.length > 1 &&
        closed.some((row) => row.finished_on === null),
      progress: { seenEver: notes.length, current, aired: airedBySeries.get(seriesId) ?? null,
        status: general?.status ?? null } });
  }

  return { works, episodes, excludedSeriesWithoutEpisodes };
}

export function commonEpisodes(facts: Facts, key: WorkKey,
  people: string[]): WorkDetail['commonEpisodes'] {
  if (!key.startsWith('series:') || people.length === 0 || new Set(people).size !== people.length) return [];
  const perPerson = people.map((userId) => facts.episodes[`${userId}|${key}`] ?? []);
  const shared = perPerson[0].filter((note) => note.rating !== null);
  return shared.flatMap((first) => {
    const notes: { userId: string; rating: number }[] = [];
    for (let index = 0; index < people.length; index++) {
      const entry = perPerson[index].find((note) => note.season === first.season &&
        note.episode === first.episode && note.rating !== null);
      if (entry?.rating === null || entry === undefined) return [];
      notes.push({ userId: people[index], rating: entry.rating });
    }
    return [{ season: first.season, episode: first.episode, notes }];
  });
}
