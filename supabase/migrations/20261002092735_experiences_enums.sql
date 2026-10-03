-- Enum values must commit before their consumers in experiences_core.
alter type public.post_anchor_type add value if not exists 'experience';
alter type public.post_kind add value if not exists 'experience';
alter type public.target_kind add value if not exists 'experience';
alter type public.notification_type add value if not exists 'experience_invited';
alter type public.notification_type add value if not exists 'experience_accepted';
alter type public.notification_type add value if not exists 'followed_experience';
