import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, FileUser, Sparkles, PenLine, Search, Kanban, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cv", label: "My CV", icon: FileUser },
  { to: "/match", label: "ATS Match", icon: Sparkles },
  { to: "/cover-letter", label: "Cover Letter", icon: PenLine },
  { to: "/cover-letters", label: "Saved Letters", icon: Mail },
  { to: "/jobs", label: "Job Search", icon: Search },
  { to: "/applications", label: "Tracker", icon: Kanban },
] as const;

export function AppLayout() {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden md:flex w-60 flex-col border-r border-border min-h-screen p-4 sticky top-0">
          <div className="px-2 mb-6">
            <h1 className="text-lg font-semibold tracking-tight">JobCraft</h1>
            <p className="text-xs text-muted-foreground">Your application copilot</p>
          </div>
          <nav className="flex flex-col gap-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = loc.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur z-40">
        <div className="grid grid-cols-7">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="leading-none">{n.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
