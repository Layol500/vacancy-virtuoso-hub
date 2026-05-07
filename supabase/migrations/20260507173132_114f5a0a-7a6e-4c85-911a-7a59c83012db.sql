
-- Application status enum
CREATE TYPE public.application_status AS ENUM ('saved','applied','interview','offer','rejected');

-- CVs (single user, but multiple versions allowed)
CREATE TABLE public.cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My CV',
  file_name text,
  file_path text,
  content text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jobs
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company text,
  location text,
  source_url text,
  description text NOT NULL DEFAULT '',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Analyses
CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  cv_id uuid REFERENCES public.cvs(id) ON DELETE SET NULL,
  score int NOT NULL DEFAULT 0,
  matched_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cover letters
CREATE TABLE public.cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  cv_id uuid REFERENCES public.cvs(id) ON DELETE SET NULL,
  tone text NOT NULL DEFAULT 'professional',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Applications
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status public.application_status NOT NULL DEFAULT 'saved',
  notes text,
  applied_at date,
  follow_up_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER cvs_touch BEFORE UPDATE ON public.cvs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER applications_touch BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS
ALTER TABLE public.cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Single-user app: allow public full access (no auth required by user)
CREATE POLICY "public all cvs" ON public.cvs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all analyses" ON public.analyses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all cover_letters" ON public.cover_letters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all applications" ON public.applications FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for CV files
INSERT INTO storage.buckets (id, name, public) VALUES ('cvs','cvs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read cvs bucket" ON storage.objects FOR SELECT USING (bucket_id = 'cvs');
CREATE POLICY "public insert cvs bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cvs');
CREATE POLICY "public update cvs bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'cvs');
CREATE POLICY "public delete cvs bucket" ON storage.objects FOR DELETE USING (bucket_id = 'cvs');
