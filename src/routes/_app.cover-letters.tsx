import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Download, Trash2, ChevronDown, ChevronUp, Mail } from "lucide-react";

export const Route = createFileRoute("/_app/cover-letters")({ component: CoverLettersPage });

type Row = {
  id: string;
  tone: string;
  content: string;
  created_at: string;
  job_id: string | null;
  jobs: { title: string; company: string | null } | null;
};

function CoverLettersPage() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: letters = [], isLoading } = useQuery({
    queryKey: ["cover_letters"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cover_letters")
        .select("id,tone,content,created_at,job_id,jobs(title,company)")
        .order("created_at", { ascending: false });
      return (data || []) as unknown as Row[];
    },
  });

  async function remove(id: string) {
    await supabase.from("cover_letters").delete().eq("id", id);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["cover_letters"] });
  }

  function download(r: Row) {
    const name = (r.jobs?.company || "letter").toLowerCase().replace(/\s+/g, "-");
    const blob = new Blob([r.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Saved Cover Letters</h1>
        <p className="text-muted-foreground mt-1">All cover letters you've generated.</p>
      </div>

      {!isLoading && !letters.length && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No cover letters yet. Generate one in <Link to="/cover-letter" className="underline">Cover Letter</Link> or use Auto-match in <Link to="/jobs" className="underline">Job Search</Link>.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {letters.map((r) => {
          const isOpen = openId === r.id;
          return (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{r.jobs?.title || "Untitled role"}</span>
                    </CardTitle>
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      {r.jobs?.company && <span>{r.jobs.company}</span>}
                      <Badge variant="secondary">{r.tone}</Badge>
                      <span className="text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(isOpen ? null : r.id)}>
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(r.content); toast.success("Copied"); }}>
                      <Copy className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => download(r)}>
                      <Download className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isOpen && (
                <CardContent>
                  <Textarea value={r.content} readOnly className="min-h-[400px] whitespace-pre-wrap" />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
