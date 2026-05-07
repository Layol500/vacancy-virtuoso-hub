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
import { Loader2, Search, ExternalLink, Bookmark, Sparkles, Wand2, FileText } from "lucide-react";

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
  const [seniority, setSeniority] = useState<string>("any");
  const [employmentType, setEmploymentType] = useState<string>("any");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
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
