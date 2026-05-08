import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUser, Sparkles, PenLine, Search, Kanban, ArrowRight, Mail } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [cv, jobs, apps, analyses] = await Promise.all([
        supabase.from("cvs").select("id,name").limit(1).maybeSingle(),
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("applications").select("status"),
        supabase.from("analyses").select("id", { count: "exact", head: true }),
      ]);
      const byStatus: Record<string, number> = {};
      (apps.data || []).forEach((a) => (byStatus[a.status] = (byStatus[a.status] || 0) + 1));
      return {
        hasCv: !!cv.data,
        jobs: jobs.count || 0,
        analyses: analyses.count || 0,
        byStatus,
        total: apps.data?.length || 0,
      };
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">
          Tailor your applications, score them against ATS, and track every opportunity.
        </p>
      </div>

      {!stats?.hasCv && (
        <Card className="border-primary/40">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div>
              <p className="font-medium">Start by uploading your CV</p>
              <p className="text-sm text-muted-foreground">Everything else builds on it.</p>
            </div>
            <Button asChild>
              <Link to="/cv">Upload CV <ArrowRight className="size-4 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Saved jobs" value={stats?.jobs ?? 0} />
        <StatCard label="ATS analyses" value={stats?.analyses ?? 0} />
        <StatCard label="Applications" value={stats?.total ?? 0} />
        <StatCard label="In interview" value={stats?.byStatus?.interview ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ActionCard to="/match" icon={Sparkles} title="ATS Match" desc="Score your CV against any job description." />
        <ActionCard to="/cover-letter" icon={PenLine} title="Cover Letter" desc="Generate a tailored cover letter in seconds." />
        <ActionCard to="/cover-letters" icon={Mail} title="Saved Letters" desc="Browse cover letters you've drafted." />
        <ActionCard to="/jobs" icon={Search} title="Find Jobs" desc="Search live vacancies worldwide." />
        <ActionCard to="/applications" icon={Kanban} title="Tracker" desc="Move applications through stages." />
        <ActionCard to="/cv" icon={FileUser} title="My CV" desc="Update or replace your CV." />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to as any} className="block">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-secondary flex items-center justify-center">
              <Icon className="size-5" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground -mt-2">{desc}</CardContent>
      </Card>
    </Link>
  );
}
