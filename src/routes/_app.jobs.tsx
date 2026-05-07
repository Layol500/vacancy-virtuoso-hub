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
import { Loader2, Search, ExternalLink, Bookmark, Sparkles, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_app/jobs")({ component: JobsPage });

type Result = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  source_url: string;
  description: string;
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
  const [results, setResults] = useState<Result[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStep, setAutoStep] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cv } = useQuery({
    queryKey: ["cv"],
    queryFn: async () =>
      (await supabase.from("cvs").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setScores({});
    try {
      const r = await searchFn({
        data: {
          query,
          location,
          seniority: seniority !== "any" ? (seniority as any) : undefined,
          employmentType: employmentType !== "any" ? (employmentType as any) : undefined,
          remoteOnly: remoteOnly || undefined,
        },
      });
      setResults(r.jobs);
      if (r.error) setError(r.error);
    } catch (e: any) {
      setError(e.message || "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveJob(j: Result) {
    const { data } = await supabase
      .from("jobs")
      .insert({
        title: j.title,
        company: j.company,
        location: j.location,
        source_url: j.source_url,
        description: j.description,
        external_id: j.external_id,
      })
      .select("id")
      .single();
    if (data) {
      await supabase.from("applications").insert({ job_id: data.id, status: "saved" });
      toast.success("Saved to tracker");
      qc.invalidateQueries();
    }
    return data?.id as string | undefined;
  }

  async function autoMatchAndDraft() {
    if (!cv?.content) return toast.error("Upload your CV first on My CV");
    if (!results.length) return toast.error("Run a search first");
    const n = Math.max(1, Math.min(parseInt(topN) || 3, results.length));
    setAutoBusy(true);
    setScores({});
    try {
      setAutoStep(`Scoring ${results.length} jobs...`);
      const scored: { job: Result; score: number; analysis: any }[] = [];
      for (let i = 0; i < results.length; i++) {
        const j = results[i];
        setAutoStep(`Scoring ${i + 1}/${results.length}: ${j.title}`);
        try {
          const a = await analyzeFn({ data: { cv: cv.content, jd: j.description || j.title } });
          scored.push({ job: j, score: a.score ?? 0, analysis: a });
          setScores((prev) => ({ ...prev, [j.external_id]: a.score ?? 0 }));
        } catch (e: any) {
          if (e?.message?.includes("Rate limit")) {
            toast.error("Rate limit hit. Try fewer results or wait a moment.");
            break;
          }
          scored.push({ job: j, score: 0, analysis: null });
        }
      }
      const top = scored.sort((a, b) => b.score - a.score).slice(0, n);
      let drafted = 0;
      for (let i = 0; i < top.length; i++) {
        const { job, score, analysis } = top[i];
        setAutoStep(`Drafting cover letter ${i + 1}/${top.length}: ${job.title}`);
        const jobId = await saveJob(job);
        if (!jobId) continue;
        if (analysis) {
          await supabase.from("analyses").insert({
            job_id: jobId,
            cv_id: cv.id,
            score,
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
        } catch (e: any) {
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
                placeholder="Location (city, country)"
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
        {results.map((j) => (
          <Card key={j.external_id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {j.title}
                    {scores[j.external_id] != null && (
                      <Badge variant={scores[j.external_id] >= 70 ? "default" : "secondary"}>
                        {scores[j.external_id]}/100
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {j.company} {j.location && <Badge variant="secondary" className="ml-2">{j.location}</Badge>}
                  </p>
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
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                {j.description}
              </p>
            </CardContent>
          </Card>
        ))}
        {!results.length && !busy && !error && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Tip: you can also paste any JD directly into <Link to="/match" className="underline"><Sparkles className="size-3 inline" /> ATS Match</Link> without searching.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
