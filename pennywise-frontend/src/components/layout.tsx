import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  ListFilter,
  Tags,
  RefreshCw,
  PieChart,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

export function Layout({ children, onSync, isSyncing }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity"
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
