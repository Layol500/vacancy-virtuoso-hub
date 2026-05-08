import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMatch } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader as Loader2, Sparkles, Save, TriangleAlert as AlertTriangle } from "lucide-react";
import { z } from "zod";

const search = z.object({ jobId: z.string().optional() });

export const Route = createFileRoute("/_app/match")({
  component: MatchPage,
  validateSearch: (s) => search.parse(s),
});

type Analysis = {
  score: number;
  summary: string;
  matched_keywords: string[];
  missing_keywords: string[];
  required_missing: string[];
  strengths: string[];
  suggestions: string[];
  keyword_density: number;
};

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-blue-600 dark:text-blue-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreLabel(score: number) {
  if (score >= 85) return "Excellent match";
  if (score >= 70) return "Good match";
  if (score >= 50) return "Partial match";
  return "Poor match";
}

function MatchPage() {
  const qc = useQueryClient();
  const { jobId } = useSearch({ from: "/_app/match" });
  const analyzeFn = useServerFn(analyzeMatch);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: cv } = useQuery({
    queryKey: ["cv"],
    queryFn: async () =>
      (await supabase.from("cvs").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  useEffect(() => {
    if (!jobId) return;
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle().then(({ data }) => {
      if (data) {
        setTitle(data.title || "");
        setCompany(data.company || "");
        setJd(data.description || "");
      }
    });
  }, [jobId]);

  async function run() {
    if (!cv?.content) return toast.error("Upload your CV first");
    if (jd.trim().length < 30) return toast.error("Paste a job description");
    setBusy(true);
    setAnalysis(null);
    try {
      const res = await analyzeFn({ data: { cv: cv.content, jd } });
      setAnalysis(res as Analysis);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveJobAndAnalysis() {
    if (!analysis) return;
    try {
      let useJobId = jobId;
      if (!useJobId) {
        const { data, error } = await supabase
          .from("jobs")
          .insert({ title: title || "Untitled role", company, description: jd })
          .select("id")
          .single();
        if (error || !data) {
          toast.error("Failed to save job");
          return;
        }
        useJobId = data.id;
      }
      await supabase.from("analyses").insert({
        job_id: useJobId,
        cv_id: cv?.id,
        score: analysis.score,
        matched_keywords: analysis.matched_keywords ?? [],
        missing_keywords: analysis.missing_keywords ?? [],
        strengths: analysis.strengths ?? [],
        suggestions: analysis.suggestions ?? [],
        summary: analysis.summary ?? "",
      });
      toast.success("Saved to your job");
      qc.invalidateQueries();
    } catch {
      toast.error("Failed to save analysis");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ATS Match</h1>
        <p className="text-muted-foreground mt-1">Score your CV against any job description with keyword-level analysis.</p>
      </div>

      {!cv?.content && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm">
            You haven't uploaded a CV yet. Go to <strong>My CV</strong> first.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Role title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <Textarea
            placeholder="Paste the full job description here..."
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="min-h-[260px]"
          />
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
            Analyze match
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Match Results</CardTitle>
              <Button size="sm" variant="secondary" onClick={saveJobAndAnalysis}>
                <Save className="size-4 mr-2" /> Save
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">ATS Score</span>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-bold ${scoreColor(analysis.score)}`}>
                        {analysis.score}
                      </span>
                      <span className="text-lg text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Progress value={analysis.score} className="h-3" />
                  <p className={`text-sm font-medium mt-1 ${scoreColor(analysis.score)}`}>
                    {scoreLabel(analysis.score)}
                  </p>
                </div>
                {analysis.keyword_density !== undefined && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Keyword coverage</p>
                    <p className="text-2xl font-semibold">{analysis.keyword_density}%</p>
                  </div>
                )}
              </div>
              <p className="text-sm leading-relaxed border-l-2 border-primary/40 pl-3">{analysis.summary}</p>
            </CardContent>
          </Card>

          {analysis.required_missing && analysis.required_missing.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" />
                  Critical gaps — required skills missing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.required_missing.map((k, i) => (
                    <Badge key={i} variant="destructive">{k}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
                  Matched keywords ({analysis.matched_keywords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.matched_keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.matched_keywords.map((k, i) => (
                      <Badge key={i} variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">{k}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No keyword matches found.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                  Missing keywords ({analysis.missing_keywords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.missing_keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.missing_keywords.map((k, i) => (
                      <Badge key={i} variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">{k}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No missing keywords — great coverage!</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="Strengths" items={analysis.strengths} />
            <SectionCard title="Suggestions to improve your CV" items={analysis.suggestions} />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
          {items.map((s, i) => (
            <li key={i} className="leading-relaxed">{s}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
