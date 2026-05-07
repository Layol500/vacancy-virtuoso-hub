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
import { Loader2, Sparkles, Save } from "lucide-react";
import { z } from "zod";

const search = z.object({ jobId: z.string().optional() });

export const Route = createFileRoute("/_app/match")({
  component: MatchPage,
  validateSearch: (s) => search.parse(s),
});

function MatchPage() {
  const qc = useQueryClient();
  const { jobId } = useSearch({ from: "/_app/match" });
  const analyzeFn = useServerFn(analyzeMatch);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
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
      setAnalysis(res);
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveJobAndAnalysis() {
    if (!analysis) return;
    let useJobId = jobId;
    if (!useJobId) {
      const { data } = await supabase
        .from("jobs")
        .insert({ title: title || "Untitled role", company, description: jd })
        .select("id")
        .single();
      useJobId = data?.id;
    }
    await supabase.from("analyses").insert({
      job_id: useJobId,
      cv_id: cv?.id,
      score: analysis.score,
      matched_keywords: analysis.matched_keywords,
      missing_keywords: analysis.missing_keywords,
      strengths: analysis.strengths,
      suggestions: analysis.suggestions,
      summary: analysis.summary,
    });
    toast.success("Saved to your job");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ATS Match</h1>
        <p className="text-muted-foreground mt-1">Score your CV against any job description.</p>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Results</CardTitle>
            <Button size="sm" variant="secondary" onClick={saveJobAndAnalysis}>
              <Save className="size-4 mr-2" /> Save
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm text-muted-foreground">ATS Score</p>
                <p className="text-3xl font-bold">{analysis.score}/100</p>
              </div>
              <Progress value={analysis.score} />
            </div>
            <p className="text-sm">{analysis.summary}</p>

            <Section title="Strengths" items={analysis.strengths} />
            <Section title="Suggestions" items={analysis.suggestions} />
            <KeywordSection title="Matched keywords" items={analysis.matched_keywords} variant="default" />
            <KeywordSection title="Missing keywords" items={analysis.missing_keywords} variant="destructive" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-sm font-medium mb-2">{title}</p>
      <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function KeywordSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "default" | "destructive";
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k, i) => (
          <Badge key={i} variant={variant === "destructive" ? "destructive" : "secondary"}>
            {k}
          </Badge>
        ))}
      </div>
    </div>
  );
}
