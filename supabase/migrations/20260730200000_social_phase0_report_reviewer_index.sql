-- Social Phase 0: cover the reviewer FK used by moderation audit lookups and
-- cascades. Kept separate because the base moderation migration was already
-- applied to biblioshare-dev before the performance advisor pass.

create index content_reports_reviewed_by_idx
  on public.content_reports (reviewed_by)
  where reviewed_by is not null;
