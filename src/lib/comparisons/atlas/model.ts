import type { Media, Snapshot, WorkKey } from '../types';
import type { AtlasOwner, AtlasPerson, AtlasWork } from './types';

/** Fixed palette on the always-dark atlas ground, assigned in people order («Tú» first). */
export const PERSON_COLORS = ['#e08a5a', '#5aa7a6', '#b48ac0', '#7fa2d6', '#d6b45a',
  '#8fcf7a', '#e07a9a', '#6fc3d6', '#c9a07a', '#a0a8e0'] as const;

export function atlasModel(snapshot: Snapshot, viewerId: string, youLabel: string): { people: AtlasPerson[]; works: AtlasWork[] } {
  const members = snapshot.group.members.filter(member => member.available && member.userId !== null);
  const ordered = [...members.filter(member => member.userId === viewerId), ...members.filter(member => member.userId !== viewerId)];
  const people: AtlasPerson[] = ordered.map((member, index) => ({ id: member.userId!,
    name: member.userId === viewerId ? youLabel : member.name ?? '', avatarUrl: member.avatarUrl,
    color: PERSON_COLORS[index % PERSON_COLORS.length], isMe: member.userId === viewerId }));
  const order = new Map(people.map((person, index) => [person.id, index]));
  const catalog = new Map(snapshot.catalog.map(item => [item.key, item]));
  const owners = new Map<WorkKey, AtlasOwner[]>();
  for (const work of snapshot.works) {
    if (!order.has(work.userId)) continue;
    const list = owners.get(work.key) ?? [];
    if (list.some(owner => owner.userId === work.userId)) continue;
    list.push({ userId: work.userId, rating: work.rating, date: work.date });
    owners.set(work.key, list);
  }
  const works = [...owners].map(([key, list]): AtlasWork => {
    const [itemType, itemId] = key.split(':') as [Media, string];
    const meta = catalog.get(key);
    return { key, itemType, itemId, title: meta?.title ?? '', metadataMissing: !meta || !!meta.metadataMissing,
      coverUrl: meta?.coverUrl ?? null, genres: meta?.genres ?? [], creators: meta?.creators ?? [],
      owners: list.toSorted((a, b) => order.get(a.userId)! - order.get(b.userId)!) };
  });
  // Stable spiral order: itemType + itemId (the key is exactly `${type}:${id}`).
  return { people, works: works.toSorted((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
}
