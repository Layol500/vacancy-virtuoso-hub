import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateCoverLetter } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, PenLine, Save, Copy, Download } from "lucide-react";
import { z } from "zod";

const search = z.object({ jobId: z.string().optional() });

export const Route = createFileRoute("/_app/cover-letter")({
  component: CoverLetterPage,
  validateSearch: (s) => search.parse(s),
});

function CoverLetterPage() {
  const qc = useQueryClient();
  const { jobId } = useSearch({ from: "/_app/cover-letter" });
  const genFn = useServerFn(generateCoverLetter);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [tone, setTone] = useState("professional");
  const [jd, setJd] = useState("");
  const [letter, setLetter] = useState("");
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
        setRole(data.title || "");
        setCompany(data.company || "");
        setJd(data.description || "");
      }
    });
  }, [jobId]);

  async function run() {
    if (!cv?.content) return toast.error("Upload your CV first");
    if (jd.trim().length < 30) return toast.error("Paste a job description");
    setBusy(true);
    try {
      const res = await genFn({ data: { cv: cv.content, jd, tone, company, role } });
      setLetter(res.content);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!letter) return;
    let useJobId = jobId;
    if (!useJobId) {
      const { data } = await supabase
        .from("jobs")
        .insert({ title: role || "Untitled role", company, description: jd })
        .select("id")
        .single();
      useJobId = data?.id;
    }
    await supabase.from("cover_letters").insert({
      job_id: useJobId,
      cv_id: cv?.id,
      tone,
      content: letter,
    });
    toast.success("Saved");
    qc.invalidateQueries();
  }

  function download() {
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${(company || "letter").toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cover Letter</h1>
        <p className="text-muted-foreground mt-1">Tailored to the job, grounded in your CV.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
            <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description..."
            className="min-h-[200px]"
          />
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <PenLine className="size-4 mr-2" />}
            Generate cover letter
          </Button>
        </CardContent>
      </Card>

      {letter && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your cover letter</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(letter); toast.success("Copied"); }}>
                <Copy className="size-4 mr-2" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={download}>
                <Download className="size-4 mr-2" /> Download
              </Button>
              <Button size="sm" onClick={save}>
                <Save className="size-4 mr-2" /> Save
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="min-h-[500px] whitespace-pre-wrap"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
