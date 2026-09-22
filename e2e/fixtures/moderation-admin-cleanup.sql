-- DEV only. Run as postgres BEFORE and AFTER moderation-admin.spec.ts.
-- Live content and disposable users are cleaned by REST inside the spec.
-- Private moderation evidence deliberately survives hard-delete and account
-- deletion. It is not exposed or made mutable just to support browser tests.
begin;
delete from private.moderation_history
where target_id in (
 '11830000-0000-4000-8000-000000000002',
 '11830000-0000-4000-8000-000000000003',
 '11830000-0000-4000-8000-000000000004',
 '11830000-0000-4000-8000-000000000005',
 '11830000-0000-4000-8000-000000000006'
);
delete from private.moderation_state
where target_id in (
 '11830000-0000-4000-8000-000000000002',
 '11830000-0000-4000-8000-000000000003',
 '11830000-0000-4000-8000-000000000004',
 '11830000-0000-4000-8000-000000000005'
);
commit;
