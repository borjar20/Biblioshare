import { laterFinish } from "./passage";

// «Entre amigos» (spec 2026-10-27, fase 3). Puro: entran los pases visibles de
// las personas que sigues, sus identidades y el orden de la balda activa; sale
// por amigo por dónde va en la saga. Misma lógica de «último pase terminado»
// que «Tu paso» (laterFinish).

export type FriendPass = {
  userId: string;
  itemKey: string; // `tipo:id`
  status: "planned" | "in_progress" | "completed" | "dropped";
  isActive: boolean;
  rating: number | null; // 1–10
  startedOn: string | null;
  finishedOn: string | null;
  createdAt: string;
};
export type FriendIdentity = { userId: string; username: string; displayName: string | null; avatarUrl: string | null };
export type FriendsInput = {
  passes: FriendPass[];
  identities: FriendIdentity[];
  /** Mismo `order` que «Tu paso»: obras de la balda activa en orden, `tipo:id`. */
  order: Array<{ key: string; title: string; href: string; optional: boolean }>;
};
export type FriendOnSaga = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  completed: number;
  counted: number;
  status:
    | { kind: "reading"; title: string; href: string }
    | { kind: "finished" }
    | { kind: "last"; title: string; href: string }
    | { kind: "started" };
  average: number | null;
  lastActivity: string; // YYYY-MM-DD
};

export function deriveFriends({ passes, identities, order }: FriendsInput): FriendOnSaga[] {
  const index = new Map(order.map((w, i) => [w.key, i] as const));
  const counted = order.filter((w) => !w.optional).length;
  const identityOf = new Map(identities.map((i) => [i.userId, i] as const));

  const byUser = new Map<string, FriendPass[]>();
  for (const p of passes) {
    if (!index.has(p.itemKey)) continue;
    const list = byUser.get(p.userId);
    if (list) list.push(p);
    else byUser.set(p.userId, [p]);
  }

  const out: FriendOnSaga[] = [];
  for (const [userId, list] of byUser) {
    const who = identityOf.get(userId);
    if (!who) continue;

    const lastDone = new Map<string, FriendPass>();
    let reading: number | null = null;
    for (const p of list) {
      if (p.status === "completed") {
        const prev = lastDone.get(p.itemKey);
        if (!prev || laterFinish(p, prev)) lastDone.set(p.itemKey, p);
      } else if (p.status === "in_progress" && p.isActive) {
        const i = index.get(p.itemKey)!;
        if (reading === null || i > reading) reading = i;
      }
    }

    const completed = [...lastDone.keys()].filter((k) => !order[index.get(k)!].optional).length;
    const rated = [...lastDone.values()].filter((p) => p.rating !== null) as Array<FriendPass & { rating: number }>;
    const average = rated.length === 0 ? null : rated.reduce((s, p) => s + p.rating, 0) / rated.length;

    let status: FriendOnSaga["status"];
    if (reading !== null) {
      status = { kind: "reading", title: order[reading].title, href: order[reading].href };
    } else if (counted > 0 && completed === counted) {
      status = { kind: "finished" };
    } else if (lastDone.size > 0) {
      const i = Math.max(...[...lastDone.keys()].map((k) => index.get(k)!));
      status = { kind: "last", title: order[i].title, href: order[i].href };
    } else {
      status = { kind: "started" };
    }

    const lastActivity = list
      .map((p) => p.finishedOn ?? p.startedOn ?? p.createdAt.slice(0, 10))
      .reduce((a, b) => (b > a ? b : a));

    out.push({
      userId,
      username: who.username,
      displayName: who.displayName,
      avatarUrl: who.avatarUrl,
      completed,
      counted,
      status,
      average,
      lastActivity,
    });
  }

  return out.sort((a, b) =>
    a.lastActivity !== b.lastActivity
      ? (a.lastActivity > b.lastActivity ? -1 : 1)
      : a.username < b.username ? -1 : a.username > b.username ? 1 : 0,
  );
}
