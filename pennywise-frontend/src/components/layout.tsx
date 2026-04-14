import { type ReactNode, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  ListFilter,
  Tags,
  RefreshCw,
  PieChart,
  Wallet,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  onSync?: () => void;
  isSyncing?: boolean;
}

const navItems: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/spending", label: "Spending Analysis", icon: PieChart },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/connections", label: "Connections", icon: Building2 },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/rules", label: "Rules", icon: ListFilter },
];

interface SidebarNavProps {
  collapsed: boolean;
  onNavigate?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
  showToggle?: boolean;
  onToggle?: () => void;
}

function SidebarNav({
  collapsed,
  onNavigate,
  onSync,
  isSyncing,
  showToggle,
  onToggle,
}: SidebarNavProps) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <button
          onClick={onToggle}
          disabled={!showToggle}
          className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity disabled:cursor-default disabled:hover:opacity-100"
        >
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Pennywise</span>}
        </button>
      </div>
      <Separator />
      <nav className="flex-1 py-2 px-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-2">
        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          className="w-full"
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {!collapsed && <span className="ml-2">{isSyncing ? "Syncing..." : "Sync All"}</span>}
        </Button>
      </div>
    </>
  );
}

export function Layout({ children, onSync, isSyncing }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const currentItem = navItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <SidebarNav
          collapsed={collapsed}
          onSync={onSync}
          isSyncing={isSyncing}
          showToggle
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarNav
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
                onSync={onSync}
                isSyncing={isSyncing}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 font-semibold">
            <LayoutDashboard className="h-5 w-5" />
            <span>{currentItem?.label ?? "Pennywise"}</span>
          </div>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
