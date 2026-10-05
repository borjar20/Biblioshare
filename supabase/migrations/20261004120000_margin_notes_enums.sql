-- Enum values must commit before their consumers in margin_notes_*.
alter type public.target_kind add value if not exists 'margin_encounter';
alter type public.notification_type add value if not exists 'margin_note_dedicated';
alter type public.notification_type add value if not exists 'margin_commented';
alter type public.notification_type add value if not exists 'margin_liked';
