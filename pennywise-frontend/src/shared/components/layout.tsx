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
  XIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

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
  variant?: "desktop" | "mobile";
}

function SidebarNav({
  collapsed,
  onNavigate,
  onSync,
  isSyncing,
  showToggle,
  onToggle,
  variant = "desktop",
}: SidebarNavProps) {
  const isMobile = variant === "mobile";

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-4",
          isMobile ? "h-16" : "h-14",
        )}
      >
        <button
          onClick={onToggle}
          disabled={!showToggle}
          className={cn(
            "flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity disabled:cursor-default disabled:hover:opacity-100",
            isMobile ? "text-xl" : "text-lg",
          )}
        >
          <LayoutDashboard
            className={cn("shrink-0", isMobile ? "h-6 w-6" : "h-5 w-5")}
          />
          {!collapsed && <span>Pennywise</span>}
        </button>
      </div>
      <Separator />
      <nav
        className={cn(
          "flex-1",
          isMobile ? "py-3 px-3 space-y-1.5" : "py-2 px-2 space-y-1",
        )}
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center rounded-md font-medium transition-colors",
                isMobile
                  ? "gap-4 px-4 py-3 text-base"
                  : "gap-3 px-3 py-2 text-sm",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )
            }
          >
            <Icon
              className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")}
            />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className={cn(isMobile ? "p-3" : "p-2")}>
        <Button
          variant="outline"
          size={collapsed ? "icon" : isMobile ? "lg" : "default"}
          className="w-full"
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw
            className={cn(
              isMobile ? "h-5 w-5" : "h-4 w-4",
              isSyncing && "animate-spin",
            )}
          />
          {!collapsed && (
            <span className="ml-2">
              {isSyncing ? "Syncing..." : "Sync All"}
            </span>
          )}
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
        <div className="md:hidden sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-card px-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="h-12 w-12"
              >
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="data-[side=left]:w-[86vw] data-[side=left]:max-w-sm p-0 flex flex-col"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  className="absolute top-3 right-3 z-10 h-12 w-12 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80"
                >
                  <XIcon className="size-6" />
                </Button>
              </SheetClose>
              <SidebarNav
                variant="mobile"
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
                onSync={onSync}
                isSyncing={isSyncing}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 font-semibold text-base">
            <LayoutDashboard className="h-5 w-5" />
            <span className="truncate">{currentItem?.label ?? "Pennywise"}</span>
          </div>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
