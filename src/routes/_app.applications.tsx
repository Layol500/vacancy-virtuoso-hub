import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, PenLine, ExternalLink, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/applications")({ component: TrackerPage });

const STAGES = [
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
] as const;

type Stage = (typeof STAGES)[number]["id"];

type AppRow = {
  id: string;
  status: Stage;
  job_id: string;
  jobs: { id: string; title: string; company: string | null; source_url: string | null } | null;
};

function TrackerPage() {
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: apps = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("applications")
        .select("id,status,job_id,jobs(id,title,company,source_url)")
        .order("updated_at", { ascending: false });
      return (data || []) as unknown as AppRow[];
    },
  });

  async function onDragEnd(e: DragEndEvent) {
    const id = e.active.id as string;
    const newStatus = e.over?.id as Stage | undefined;
    if (!newStatus) return;
    const app = apps.find((a) => a.id === id);
    if (!app || app.status === newStatus) return;
    const patch: { status: Stage; applied_at?: string } = { status: newStatus };
    if (newStatus === "applied" && !app.status.match(/applied|interview|offer/)) {
      patch.applied_at = new Date().toISOString().slice(0, 10);
    }
    await supabase.from("applications").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["applications"] });
  }

  async function remove(id: string) {
    await supabase.from("applications").delete().eq("id", id);
    toast.success("Removed from tracker");
    qc.invalidateQueries({ queryKey: ["applications"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Tracker</h1>
        <p className="text-muted-foreground mt-1">Drag cards between stages.</p>
      </div>

      {!apps.length && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No applications yet. Save a job from <Link to="/jobs" className="underline">Job Search</Link> to start tracking.
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STAGES.map((s) => (
            <Column key={s.id} id={s.id} label={s.label}>
              {apps.filter((a) => a.status === s.id).map((a) => (
                <AppCard key={a.id} app={a} onRemove={() => remove(a.id)} />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-border bg-secondary/40 p-2 min-h-[300px] transition-colors ${isOver ? "bg-accent/60" : ""}`}
    >
      <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AppCard({ app, onRemove }: { app: AppRow; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-md border border-border p-3 text-sm shadow-sm ${isDragging ? "opacity-80" : ""}`}
    >
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
        <p className="font-medium leading-tight">{app.jobs?.title || "Untitled"}</p>
        {app.jobs?.company && (
          <p className="text-xs text-muted-foreground mt-0.5">{app.jobs.company}</p>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 gap-1">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" asChild className="h-7 px-2">
            <Link to="/match" search={{ jobId: app.job_id }}>
              <Sparkles className="size-3.5" />
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild className="h-7 px-2">
            <Link to="/cover-letter" search={{ jobId: app.job_id }}>
              <PenLine className="size-3.5" />
            </Link>
          </Button>
          {app.jobs?.source_url && (
            <Button size="sm" variant="ghost" asChild className="h-7 px-2">
              <a href={app.jobs.source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 px-2 text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
