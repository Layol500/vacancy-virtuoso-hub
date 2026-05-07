import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { searchJobs } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Search, ExternalLink, Bookmark, Sparkles } from "lucide-react";

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
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchFn({ data: { query, location } });
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
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Search</h1>
        <p className="text-muted-foreground mt-1">Live vacancies powered by JSearch.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={go} className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="Job title or keywords (e.g. data analyst)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="md:w-60"
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Search className="size-4 mr-2" />}
              Search
            </Button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {results.map((j) => (
          <Card key={j.external_id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{j.title}</CardTitle>
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
