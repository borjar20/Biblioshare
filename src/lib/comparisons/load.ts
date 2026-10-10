import 'server-only';
import { readAllRows } from '@/lib/supabase/read-all-rows';
import { chunkIds } from '@/lib/supabase/in-chunks';
import { airedFlags, isSeriesEnded, todayISO } from '@/lib/series/aired';
import { ComparisonError, readGroup, type Client } from './groups';
import { commonEpisodes, normalize } from './normalize';
import type { AiredCount, CatalogWork, Format, Group, Media, PassRow, Snapshot, WatchRow, WorkDetail, WorkKey } from './types';

const passColumns = 'id,user_id,item_type,item_id,status,is_active,rating,finished_on,created_at';
const watchColumns = 'id,user_id,series_id,pass_id,season_number,episode_number,rating,watched_on,created_at';
const tables = { book: 'books', movie: 'movies', series: 'series' } as const;
type Meta = { id: string; title: string | null; cover_url: string | null; genres: string[] | null; tmdb_status?: string | null };
type Credit = { id: string; item_id: string; person_id: string; role: string };
type Episode = { id: string; series_id: string; season_number: number; episode_number: number; air_date: string | null };

function available(group: Group): string[] {
  return group.members.flatMap(member => member.available && member.userId !== null ? [member.userId] : []);
}

async function sources(client: Client, ids: string[], format: Format, key?: WorkKey) {
  if (ids.length === 0) return { passes: [], watches: [] };
  const [type, itemId] = key?.split(':') ?? [];
  const passes = await readAllRows<PassRow>((from, to) => {
    let query = client.from('passes').select(passColumns).in('user_id', ids);
    if (format !== 'all') query = query.eq('item_type', format);
    if (type) query = query.eq('item_type', type as Media).eq('item_id', itemId);
    return query.order('id').range(from, to);
  });
  const watches = format === 'all' || format === 'series' ? await readAllRows<WatchRow>((from, to) => {
    let query = client.from('episode_watches').select(watchColumns).in('user_id', ids);
    if (itemId) query = query.eq('series_id', itemId);
    return query.order('id').range(from, to);
  }) : [];
  return { passes, watches };
}

async function catalog(client: Client, keys: WorkKey[]): Promise<{ catalog: CatalogWork[]; aired: AiredCount[] }> {
  const result = new Map<WorkKey, CatalogWork>(keys.map(key => [key, { key, title: '', metadataMissing: true,
    coverUrl: null, genres: [], creators: [] }]));
  const aired: AiredCount[] = [];
  for (const type of ['book', 'movie', 'series'] as const) {
    const ids = keys.filter(key => key.startsWith(`${type}:`)).map(key => key.slice(type.length + 1));
    for (const batch of chunkIds(ids)) {
      const rows = await readAllRows<Meta>((from, to) => type === 'series'
        ? client.from('series').select('id,title,cover_url,genres,tmdb_status').in('id', batch).order('id').range(from, to)
        : client.from(tables[type]).select('id,title,cover_url,genres').in('id', batch).order('id').range(from, to));
      for (const row of rows) result.set(`${type}:${row.id}`, { key: `${type}:${row.id}`, title: row.title ?? '',
        ...(row.title ? {} : { metadataMissing: true }), coverUrl: row.cover_url, genres: row.genres ?? [], creators: [] });
      if (type === 'series') {
        const episodes = await readAllRows<Episode>((from, to) => client.from('series_episodes')
          .select('id,series_id,season_number,episode_number,air_date').in('series_id', batch)
          .order('id').range(from, to));
        for (const id of batch) {
          const meta = rows.find(row => row.id === id);
          const ordered = episodes.filter(row => row.series_id === id)
            .sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
          aired.push({ seriesId: id, count: meta && ordered.length > 0 ? airedFlags(
            ordered.map(row => ({ airDate: row.air_date })), todayISO(), isSeriesEnded(meta.tmdb_status))
            .filter(Boolean).length : null });
        }
      }
      if (type === 'series') continue;
      const role = type === 'book' ? 'author' : 'director';
      const credits = await readAllRows<Credit>((from, to) => client.from('credits')
        .select('id,item_id,person_id,role').eq('item_type', type).eq('role', role)
        .in('item_id', batch).order('id').range(from, to));
      const people = new Map<string, string>();
      for (const peopleIds of chunkIds([...new Set(credits.map(credit => credit.person_id))])) {
        const rows = await readAllRows<{ id: string; name: string }>((from, to) => client.from('people')
          .select('id,name').in('id', peopleIds).order('id').range(from, to));
        for (const row of rows) people.set(row.id, row.name);
      }
      for (const credit of credits) {
        const work = result.get(`${type}:${credit.item_id}`);
        const name = people.get(credit.person_id);
        if (work && name && !work.creators.some(creator => creator.id === credit.person_id)) {
          work.creators.push({ id: credit.person_id, name, role });
        }
      }
    }
  }
  return { catalog: [...result.values()], aired };
}

async function evidence(client: Client, format: Format, ids: string[], key?: WorkKey) {
  const raw = await sources(client, ids, format, key);
  const keys = [...new Set(normalize(raw.passes, raw.watches, []).works.map(work => work.key))];
  return { raw, metadata: await catalog(client, keys) };
}

async function revalidate(client: Client, viewerId: string, group: Group): Promise<Group> {
  const current = await readGroup(client, viewerId, group.id);
  if (current.revision !== group.revision) throw new ComparisonError('conflict');
  return current;
}

function loadError(error: unknown): never {
  if (error instanceof ComparisonError) throw error;
  throw new ComparisonError('load-failed', { cause: error });
}

export async function loadSnapshot(client: Client, viewerId: string, groupId: string, format: Format): Promise<Snapshot> {
  try {
    const group = await readGroup(client, viewerId, groupId);
    const data = await evidence(client, format, available(group));
    const current = await revalidate(client, viewerId, group);
    // Newly available people were not queried, so cannot be represented as having zero works.
    const initialIds = new Set(available(group));
    current.members = current.members.map(member => member.userId && !initialIds.has(member.userId)
      ? { slotId: member.slotId, userId: null, name: null, avatarUrl: null, available: false } : member);
    const ids = new Set(available(current));
    const facts = normalize(data.raw.passes.filter(row => ids.has(row.user_id)),
      data.raw.watches.filter(row => ids.has(row.user_id)), data.metadata.aired);
    const keys = new Set(facts.works.map(work => work.key));
    return { group: current, format, works: facts.works, catalog: data.metadata.catalog.filter(work => keys.has(work.key)),
      excludedSeriesWithoutEpisodes: facts.excludedSeriesWithoutEpisodes };
  } catch (error) { loadError(error); }
}

export async function loadDetail(client: Client, viewerId: string, groupId: string, key: WorkKey, people: string[]): Promise<WorkDetail> {
  try {
    const group = await readGroup(client, viewerId, groupId);
    if (people.length < 1 || people.length > 10 || new Set(people).size !== people.length) throw new ComparisonError('invalid');
    const ids = new Set(available(group));
    // An unavailable slot deliberately does not expose its old identity.
    if (people.some(id => !ids.has(id))) throw new ComparisonError('unavailable');
    const type = key.split(':')[0] as Media;
    const data = await evidence(client, type, people, key);
    const current = await revalidate(client, viewerId, group);
    if (people.some(id => !available(current).includes(id))) throw new ComparisonError('unavailable');
    const facts = normalize(data.raw.passes, data.raw.watches, data.metadata.aired);
    const work = data.metadata.catalog.find(work => work.key === key);
    if (!work) throw new ComparisonError('unavailable');
    return { work, people: facts.works.filter(work => work.key === key),
      commonEpisodes: people.length >= 2 ? commonEpisodes(facts, key, people) : [] };
  } catch (error) { loadError(error); }
}
