
-- Make all changes idempotent (previous migration partially applied)
ALTER TABLE public.cvs ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.cover_letters ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

DELETE FROM public.cover_letters WHERE user_id IS NULL;
DELETE FROM public.analyses WHERE user_id IS NULL;
DELETE FROM public.applications WHERE user_id IS NULL;
DELETE FROM public.jobs WHERE user_id IS NULL;
DELETE FROM public.cvs WHERE user_id IS NULL;

ALTER TABLE public.cvs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.applications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.analyses ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cover_letters ALTER COLUMN user_id SET NOT NULL;

-- FKs (drop+add for idempotency)
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_job_id_fkey;
ALTER TABLE public.applications ADD CONSTRAINT applications_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE public.analyses DROP CONSTRAINT IF EXISTS analyses_job_id_fkey;
ALTER TABLE public.analyses ADD CONSTRAINT analyses_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE public.analyses DROP CONSTRAINT IF EXISTS analyses_cv_id_fkey;
ALTER TABLE public.analyses ADD CONSTRAINT analyses_cv_id_fkey
  FOREIGN KEY (cv_id) REFERENCES public.cvs(id) ON DELETE SET NULL;

ALTER TABLE public.cover_letters DROP CONSTRAINT IF EXISTS cover_letters_job_id_fkey;
ALTER TABLE public.cover_letters ADD CONSTRAINT cover_letters_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE public.cover_letters DROP CONSTRAINT IF EXISTS cover_letters_cv_id_fkey;
ALTER TABLE public.cover_letters ADD CONSTRAINT cover_letters_cv_id_fkey
  FOREIGN KEY (cv_id) REFERENCES public.cvs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_external_uniq
  ON public.jobs(user_id, external_id)
  WHERE external_id IS NOT NULL;

DROP POLICY IF EXISTS "public all cvs" ON public.cvs;
DROP POLICY IF EXISTS "public all jobs" ON public.jobs;
DROP POLICY IF EXISTS "public all applications" ON public.applications;
DROP POLICY IF EXISTS "public all analyses" ON public.analyses;
DROP POLICY IF EXISTS "public all cover_letters" ON public.cover_letters;
DROP POLICY IF EXISTS "own cvs" ON public.cvs;
DROP POLICY IF EXISTS "own jobs" ON public.jobs;
DROP POLICY IF EXISTS "own applications" ON public.applications;
DROP POLICY IF EXISTS "own analyses" ON public.analyses;
DROP POLICY IF EXISTS "own cover_letters" ON public.cover_letters;

CREATE POLICY "own cvs" ON public.cvs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own jobs" ON public.jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own applications" ON public.applications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own analyses" ON public.analyses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cover_letters" ON public.cover_letters FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cvs read own" ON storage.objects;
DROP POLICY IF EXISTS "cvs insert own" ON storage.objects;
DROP POLICY IF EXISTS "cvs update own" ON storage.objects;
DROP POLICY IF EXISTS "cvs delete own" ON storage.objects;

CREATE POLICY "cvs read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cvs insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cvs update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cvs delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);

UPDATE storage.buckets SET public = false WHERE id = 'cvs';
