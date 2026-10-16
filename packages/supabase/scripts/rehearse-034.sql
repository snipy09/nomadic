-- Rehearsal for 034 on a local copy (after 001-034). Rolls back.
BEGIN;
INSERT INTO public.users_profile (id, email, full_name, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'old@example.com', 'Old', NOW() - INTERVAL '8 days'),
       ('00000000-0000-0000-0000-000000000002', 'new@example.com', 'New', NOW() - INTERVAL '2 days');
INSERT INTO public.user_sessions (user_id, current_ip, session_token, device_fingerprint, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', '127.0.0.1', 'tok1', 'fp1', TRUE),
       ('00000000-0000-0000-0000-000000000002', '127.0.0.1', 'tok2', 'fp2', TRUE);
SET LOCAL ROLE anon;
SELECT 'bad session', * FROM public.app_review_status('00000000-0000-0000-0000-000000000001', 'wrong', 'fp1');
SELECT 'new account not due', * FROM public.app_review_status('00000000-0000-0000-0000-000000000002', 'tok2', 'fp2');
SELECT 'week-old account due', * FROM public.app_review_status('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1');
SELECT 'bad answers', * FROM public.app_review_submit('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'windows', '1.4.0', ARRAY[6,1,1,1,1,1,1,1,1,1]::SMALLINT[], 8::SMALLINT, NULL, NULL);
SELECT 'nine answers', * FROM public.app_review_submit('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'windows', '1.4.0', ARRAY[1,1,1,1,1,1,1,1,1]::SMALLINT[], 8::SMALLINT, NULL, NULL);
SELECT 'submit', * FROM public.app_review_submit('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'windows', '1.4.0', ARRAY[4,2,4,2,4,2,4,1,4,2]::SMALLINT[], 9::SMALLINT, ' Roadmap ', '');
SELECT 'second submit', * FROM public.app_review_submit('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'android', NULL, ARRAY[3,3,3,3,3,3,3,3,3,3]::SMALLINT[], 5::SMALLINT, NULL, NULL);
SELECT 'no longer due', * FROM public.app_review_status('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1');
SELECT 'export has review', jsonb_array_length(data->'app_reviews') FROM public.account_export_data('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1');
SAVEPOINT s1;
SELECT 'anon cannot read the table';
SELECT count(*) FROM public.app_reviews;
ROLLBACK TO SAVEPOINT s1;
RESET ROLE;
SELECT 'stored', platform, app_version, sus, recommend, best, frustrating,
       ((sus[1]-1)+(5-sus[2])+(sus[3]-1)+(5-sus[4])+(sus[5]-1)+(5-sus[6])+(sus[7]-1)+(5-sus[8])+(sus[9]-1)+(5-sus[10]))*2.5 AS sus_score
FROM public.app_reviews;
DELETE FROM public.users_profile WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT 'cascade on account delete', count(*) FROM public.app_reviews;
ROLLBACK;
