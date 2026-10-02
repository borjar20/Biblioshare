export const CONTENT_KINDS = ["post", "club_post", "comment", "club", "experience"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ModerationAction = "remove" | "restore" | "delete";
export type ModerationKind = ContentKind | "report" | "history";
export type ModerationInput = {
  kind: ContentKind;
  id: string;
  action: ModerationAction;
  reason: string;
  confirmation: string;
};
export type ModerationResult = { ok: true } | {
  ok: false;
  error: "forbidden" | "invalid" | "confirmation" | "missing" | "conflict" | "unknown";
};
export type ContentRow = {
  id: string;
  kind: ContentKind;
  title: string;
  body: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  removed_at: string | null;
  deleted_at?: string | null;
  parent_removed: boolean;
  snapshot?: Record<string, unknown>;
};
export type ReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  comment_id?: string | null;
  reason: string;
  details: string | null;
  status: "pending" | "actioned" | "dismissed";
  snapshot: Record<string, unknown>;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  target_deleted_at: string | null;
};
export type HistoryRow = {
  id: string;
  kind: string;
  target_id: string;
  action: string;
  reason: string;
  actor_id: string;
  actor_name?: string | null;
  created_at: string;
  snapshot: Record<string, unknown>;
};
export type ModerationPage<T> = { items: T[]; has_more: boolean };

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === "string" && CONTENT_KINDS.some((kind) => kind === value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Evidence is plain text, never HTML or an instruction to fetch embedded URLs. */
export function evidenceText(snapshot: Record<string, unknown>): string {
  return Object.entries(snapshot)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}
export function evidencePhotoIds(snapshot:Record<string,unknown>):string[] {
  const ids=new Set<string>();
  function visit(value:unknown,depth:number) {
    if(depth>6||!value||typeof value!=="object"||ids.size>=40)return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    const row=value as Record<string,unknown>;
    if(row.status==="ready"&&isUuid(row.id)&&typeof row.storage_path==="string")ids.add(row.id);
    for(const child of Object.values(row))visit(child,depth+1);
  }
  visit(snapshot,0);return [...ids];
}
