DROP INDEX IF EXISTS public.jobs_user_external_uniq;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_user_external_uniq UNIQUE (user_id, external_id);