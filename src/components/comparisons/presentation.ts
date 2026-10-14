import type { Snapshot } from '@/lib/comparisons/types';

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase();
}

/** The viewer reads as «Tú» everywhere in a comparison, as in the approved mockup. */
export function presentViewer(snapshot: Snapshot, viewerId: string, you: string): Snapshot {
  if (!snapshot.group.members.some(member => member.userId === viewerId)) return snapshot;
  return { ...snapshot, group: { ...snapshot.group, members: snapshot.group.members.map(member =>
    member.userId === viewerId ? { ...member, name: you } : member) } };
}
