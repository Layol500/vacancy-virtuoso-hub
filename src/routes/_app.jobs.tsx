import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchJobs, analyzeMatch, generateCoverLetter } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader as Loader2, Search, ExternalLink, Bookmark, Sparkles, Wand as Wand2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_app/jobs")({ component: JobsPage });

type Result = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  source_url: string;
  description: string;
};

type Analysis = {
  score: number;
  summary?: string;
  matched_keywords?: string[];
  missing_keywords?: string[];
  required_missing?: string[];
  strengths?: string[];
  suggestions?: string[];
  keyword_density?: number;
};

function JobsPage() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchJobs);
  const analyzeFn = useServerFn(analyzeMatch);
  const coverFn = useServerFn(generateCoverLetter);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [seniority, setSeniority] = useState<string>("any");
  const [employmentType, setEmploymentType] = useState<string>("any");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [topN, setTopN] = useState<string>("3");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Result[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStep, setAutoStep] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cv } = useQuery({
    queryKey: ["cv"],
    queryFn: async () =>
      (await supabase.from("cvs").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  async function runSearch(p: number) {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setAnalyses({});
    setOpenId(null);
    try {
      const r = await searchFn({
        data: {
          query,
          location,
          page: p,
          seniority: seniority !== "any" ? (seniority as "no_experience" | "under_3_years_experience" | "more_than_3_years_experience" | "no_degree") : undefined,
          employmentType: employmentType !== "any" ? (employmentType as "FULLTIME" | "PARTTIME" | "CONTRACTOR" | "INTERN") : undefined,
          remoteOnly: remoteOnly || undefined,
        },
      });
      setResults(r.jobs);
      setPage(p);
      if (r.error) setError(r.error);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    runSearch(1);
  }

  async function saveJob(j: Result) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("You must be signed in");
      return undefined;
    }
    const { data, error } = await supabase
      .from("jobs")
      .upsert(
        {
          title: j.title,
          company: j.company,
          location: j.location,
          source_url: j.source_url,
          description: j.description,
          external_id: j.external_id,
          user_id: uid,
        },
        { onConflict: "user_id,external_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message || "Failed to save job");
      return undefined;
    }
    // Ensure an application row exists (don't duplicate if already saved)
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("job_id", data.id)
      .maybeSingle();
    if (!existing) {
      await supabase.from("applications").insert({ job_id: data.id, status: "saved" });
    }
    toast.success("Saved to tracker");
    qc.invalidateQueries();
    return data.id as string;
  }

  async function autoMatchAndDraft() {
    if (!cv?.content) return toast.error("Upload your CV first on My CV");
    if (!results.length) return toast.error("Run a search first");
    const n = Math.max(1, Math.min(parseInt(topN) || 3, results.length));
    setAutoBusy(true);
    setAnalyses({});
    try {
      setAutoStep(`Scoring ${results.length} jobs...`);
      const scored: { job: Result; analysis: Analysis | null }[] = [];
      for (let i = 0; i < results.length; i++) {
        const j = results[i];
        setAutoStep(`Scoring ${i + 1}/${results.length}: ${j.title}`);
        try {
          const a = await analyzeFn({ data: { cv: cv.content, jd: j.description || j.title } });
          scored.push({ job: j, analysis: a });
          setAnalyses((prev) => ({ ...prev, [j.external_id]: a }));
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes("Rate limit")) {
            toast.error("Rate limit hit. Try fewer results or wait a moment.");
            break;
          }
          scored.push({ job: j, analysis: null });
        }
      }
      const top = scored
        .filter((s) => s.analysis)
        .sort((a, b) => (b.analysis!.score || 0) - (a.analysis!.score || 0))
        .slice(0, n);
      let drafted = 0;
      for (let i = 0; i < top.length; i++) {
        const { job, analysis } = top[i];
        setAutoStep(`Drafting cover letter ${i + 1}/${top.length}: ${job.title}`);
        const jobId = await saveJob(job);
        if (!jobId) continue;
        if (analysis) {
          await supabase.from("analyses").insert({
            job_id: jobId,
            cv_id: cv.id,
            score: analysis.score,
            matched_keywords: analysis.matched_keywords ?? [],
            missing_keywords: analysis.missing_keywords ?? [],
            strengths: analysis.strengths ?? [],
            suggestions: analysis.suggestions ?? [],
            summary: analysis.summary ?? "",
          });
        }
        try {
          const letter = await coverFn({
            data: {
              cv: cv.content,
              jd: job.description || job.title,
              company: job.company,
              role: job.title,
              tone: "professional",
            },
          });
          await supabase.from("cover_letters").insert({
            job_id: jobId,
            cv_id: cv.id,
            tone: "professional",
            content: letter.content,
          });
          drafted++;
        } catch (e: unknown) {
          console.error("cover letter failed", e);
        }
      }
      toast.success(`Saved ${top.length} top jobs, drafted ${drafted} cover letters`);
      qc.invalidateQueries();
    } finally {
      setAutoBusy(false);
      setAutoStep("");
    }
  }

  async function scoreOne(j: Result) {
    if (!cv?.content) return toast.error("Upload your CV first");
    setAnalyses((p) => ({ ...p, [j.external_id]: { score: -1 } as Analysis }));
    try {
      const a = await analyzeFn({ data: { cv: cv.content, jd: j.description || j.title } });
      setAnalyses((p) => ({ ...p, [j.external_id]: a as Analysis }));
      setOpenId(j.external_id);
    } catch (e: unknown) {
      setAnalyses((p) => {
        const cp = { ...p };
        delete cp[j.external_id];
        return cp;
      });
      toast.error(e instanceof Error ? e.message : "Scoring failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Search</h1>
        <p className="text-muted-foreground mt-1">Live vacancies powered by JSearch.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={go} className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="Job title or keywords (e.g. data analyst)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Location (e.g. London, United Kingdom)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="md:w-60"
              />
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Search className="size-4 mr-2" />}
                Search
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Seniority</Label>
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any level</SelectItem>
                    <SelectItem value="no_experience">Entry / no experience</SelectItem>
                    <SelectItem value="under_3_years_experience">Junior (under 3 yrs)</SelectItem>
                    <SelectItem value="more_than_3_years_experience">Senior (3+ yrs)</SelectItem>
                    <SelectItem value="no_degree">No degree required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Employment type</Label>
                <Select value={employmentType} onValueChange={setEmploymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any type</SelectItem>
                    <SelectItem value="FULLTIME">Full-time</SelectItem>
                    <SelectItem value="PARTTIME">Part-time</SelectItem>
                    <SelectItem value="CONTRACTOR">Contract</SelectItem>
                    <SelectItem value="INTERN">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between md:justify-start gap-3 md:pt-6">
                <Label htmlFor="remote" className="text-sm">Remote only</Label>
                <Switch id="remote" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
              </div>
            </div>
          </form>
          {error && (
            <p className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <Wand2 className="size-4 text-primary" /> Auto-match top jobs
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Score every result against your CV, save the top picks, and draft tailored cover letters.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="topn" className="text-xs text-muted-foreground">Top</Label>
              <Select value={topN} onValueChange={setTopN}>
                <SelectTrigger id="topn" className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 3, 5, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={autoMatchAndDraft} disabled={autoBusy || !cv?.content}>
                {autoBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
                Auto-match & draft
              </Button>
            </div>
          </CardContent>
          {autoBusy && autoStep && (
            <CardContent className="pt-0 text-xs text-muted-foreground">{autoStep}</CardContent>
          )}
          {!cv?.content && (
            <CardContent className="pt-0 text-xs text-destructive">
              Upload your CV on <Link to="/cv" className="underline">My CV</Link> to enable auto-match.
            </CardContent>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {results.map((j) => {
          const a = analyses[j.external_id];
          const isOpen = openId === j.external_id;
          const scoring = a && a.score === -1;
          return (
            <Card key={j.external_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                      <span>{j.title}</span>
                      {a && a.score >= 0 && (
                        <Badge variant={a.score >= 70 ? "default" : "secondary"}>
                          {a.score}/100
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{j.company}</span>
                      {j.location && <Badge variant="secondary">{j.location}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {j.source_url && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={j.source_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => saveJob(j)}>
                      <Bookmark className="size-4 mr-1" /> Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                  {j.description}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {!a && (
                    <Button size="sm" variant="outline" onClick={() => scoreOne(j)} disabled={!cv?.content}>
                      <Sparkles className="size-3.5 mr-1" /> Score against my CV
                    </Button>
                  )}
                  {scoring && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> Scoring…
                    </span>
                  )}
                  {a && a.score >= 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(isOpen ? null : j.external_id)}>
                      {isOpen ? <ChevronUp className="size-3.5 mr-1" /> : <ChevronDown className="size-3.5 mr-1" />}
                      {isOpen ? "Hide details" : "Match details"}
                    </Button>
                  )}
                </div>
                {isOpen && a && a.score >= 0 && (
                  <div className="rounded-md border border-border p-3 space-y-3 bg-secondary/30">
                    {a.summary && <p className="text-sm">{a.summary}</p>}
                    <KeywordRow title="Matched" items={a.matched_keywords} variant="default" />
                    <KeywordRow title="Missing" items={a.missing_keywords} variant="destructive" />
                    <BulletRow title="Strengths" items={a.strengths} />
                    <BulletRow title="Suggestions" items={a.suggestions} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!results.length && !busy && !error && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Tip: you can also paste any JD directly into <Link to="/match" className="underline">ATS Match</Link> without searching.
            </CardContent>
          </Card>
        )}
        {results.length > 0 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || busy}
              onClick={() => runSearch(page - 1)}
            >
              <ChevronLeft className="size-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || results.length === 0}
              onClick={() => runSearch(page + 1)}
            >
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordRow({ title, items, variant }: { title: string; items?: string[]; variant: "default" | "destructive" }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k, i) => (
          <Badge key={i} variant={variant === "destructive" ? "destructive" : "secondary"}>{k}</Badge>
        ))}
      </div>
    </div>
  );
}

function BulletRow({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">{title}</p>
      <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
