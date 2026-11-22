import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  FileUp,
  Home,
  LayoutDashboard,
  Layers,
  Menu,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: LucideIcon;
  to:
    | "/"
    | "/smart-revision"
    | "/smart-revision/upload"
    | "/smart-revision/generate"
    | "/smart-revision/daily"
    | "/smart-revision/decks"
    | "/smart-revision/progress";
};

const mainNav: NavItem[] = [{ label: "Home", icon: Home, to: "/" }];

const revisionNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/smart-revision" },
  { label: "Upload PDF", icon: FileUp, to: "/smart-revision/upload" },
  { label: "Generate Flashcards", icon: Sparkles, to: "/smart-revision/generate" },
  { label: "Daily Revision", icon: CalendarClock, to: "/smart-revision/daily" },
  { label: "My Decks", icon: Layers, to: "/smart-revision/decks" },
  { label: "Progress", icon: BarChart3, to: "/smart-revision/progress" },
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-hero text-primary-foreground shadow-lift">
        <BookOpenCheck className="size-5" />
      </span>
      <span className="font-display text-lg font-bold text-foreground">
        Brain<span className="text-primary">Stack</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    // My Decks stays highlighted on a deck's own page.
    const active =
      pathname.replace(/(.)\/$/, "$1") === item.to ||
      (item.to === "/smart-revision/decks" && pathname.startsWith("/smart-revision/decks/"));
    return (
      <Link
        key={item.label}
        to={item.to}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-muted",
        )}
      >
        <Icon className={cn("size-[18px]", active && "text-primary")} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">{mainNav.map(renderItem)}</div>
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Smart Revision
        </p>
        {revisionNav.map(renderItem)}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background bg-wash">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 border-r border-sidebar-border bg-sidebar/90 px-4 py-6 backdrop-blur lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto rounded-2xl bg-primary-soft p-4 text-sm">
          <p className="font-semibold text-secondary-foreground">Learn smarter, not longer</p>
          <p className="mt-1 text-muted-foreground">
            Spaced repetition shows each card right before you'd forget it.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl p-2 text-foreground hover:bg-muted"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex flex-col gap-8">
            <Brand />
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
