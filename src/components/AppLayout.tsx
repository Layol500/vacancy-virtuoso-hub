import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FileUser, Sparkles, PenLine, Search, Kanban, Mail, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { to: "/cv", label: "My CV", icon: FileUser, mobile: true },
  { to: "/match", label: "ATS Match", icon: Sparkles, mobile: true },
  { to: "/jobs", label: "Job Search", icon: Search, mobile: true },
  { to: "/applications", label: "Tracker", icon: Kanban, mobile: true },
  { to: "/cover-letter", label: "Cover Letter", icon: PenLine, mobile: false },
  { to: "/cover-letters", label: "Saved Letters", icon: Mail, mobile: false },
] as const;

export function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const mobileNav = nav.filter((n) => n.mobile);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden md:flex w-60 flex-col border-r border-border min-h-screen p-4 sticky top-0">
          <div className="px-2 mb-6">
            <h1 className="text-lg font-semibold tracking-tight">JobCraft</h1>
            <p className="text-xs text-muted-foreground">Your application copilot</p>
          </div>
          <nav className="flex flex-col gap-1 flex-1">
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
          <div className="border-t border-border pt-3 mt-2 space-y-2">
            {user?.email && (
              <p className="text-xs text-muted-foreground truncate px-2" title={user.email}>
                {user.email}
              </p>
            )}
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
              <LogOut className="size-4 mr-2" /> Sign out
            </Button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
            <h1 className="text-base font-semibold">JobCraft</h1>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur z-40">
        <div className="grid grid-cols-5">
          {mobileNav.map((n) => {
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
