-- Enum values must commit before their consumers in experience_reviews_*.
alter type public.post_kind add value if not exists 'experience_review';
alter type public.post_source_kind add value if not exists 'experience_review';
alter type public.target_kind add value if not exists 'experience_review';
alter type public.notification_type add value if not exists 'experience_reviewed';
