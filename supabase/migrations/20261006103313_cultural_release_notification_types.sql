-- Keep enum additions in their own transaction before any CHECK/RPC consumes them.
alter type public.notification_type add value if not exists 'release_reminder';
alter type public.notification_type add value if not exists 'release_updated';
alter type public.notification_type add value if not exists 'release_cancelled';
