import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCvFile } from "@/lib/cv-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Save, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/cv")({ component: CvPage });

function CvPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("My CV");
  const [content, setContent] = useState("");

  const { data: cv } = useQuery({
    queryKey: ["cv"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cvs")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setName(data.name);
        setContent(data.content);
      }
      return data;
    },
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await parseCvFile(file);
      setContent(text);
      // upload original to storage under {user_id}/ folder (required by RLS)
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      let filePath: string | null = null;
      if (uid) {
        const path = `${uid}/cv-${Date.now()}-${file.name}`;
        const up = await supabase.storage.from("cvs").upload(path, file, { upsert: true });
        if (up.error) {
          console.error("CV upload failed:", up.error);
          toast.error(`File upload failed: ${up.error.message}`);
        } else {
          filePath = up.data?.path || null;
        }
      }
      const payload = {
        name: name || file.name,
        file_name: file.name,
        file_path: filePath,
        content: text,
        is_default: true,
      };
      if (cv) {
        await supabase.from("cvs").update(payload).eq("id", cv.id);
      } else {
        await supabase.from("cvs").insert(payload);
      }
      toast.success("CV uploaded and parsed");
      qc.invalidateQueries({ queryKey: ["cv"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    if (!content.trim()) return toast.error("CV is empty");
    setBusy(true);
    try {
      if (cv) {
        await supabase.from("cvs").update({ name, content }).eq("id", cv.id);
      } else {
        await supabase.from("cvs").insert({ name, content, is_default: true });
      }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["cv"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My CV</h1>
        <p className="text-muted-foreground mt-1">Upload a PDF/DOCX or paste your CV text below.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CV details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CV name" />
          <div className="flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              hidden
              onChange={handleFile}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Upload className="size-4 mr-2" />}
              Upload PDF/DOCX
            </Button>
            <Button onClick={save} disabled={busy}>
              <Save className="size-4 mr-2" /> Save
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Your CV text will appear here after upload, or paste it manually..."
            className="min-h-[480px] font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {content.length.toLocaleString()} characters
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
