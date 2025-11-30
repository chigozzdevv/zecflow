import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Workflow,
  Zap,
  Database,
  Network,
  Layers3,
  Wallet,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Table,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
  { icon: Workflow, label: "Workflows", path: "/dashboard/workflows" },
  { icon: Zap, label: "Runs", path: "/dashboard/runs" },
  { icon: Network, label: "Triggers", path: "/dashboard/triggers" },
   { icon: Table, label: "Datasets", path: "/dashboard/datasets" },
  { icon: Database, label: "Connectors", path: "/dashboard/connectors" },
  { icon: Layers3, label: "Blocks", path: "/dashboard/blocks" },
  { icon: Wallet, label: "Credits", path: "/dashboard/credits" },
];

type DashboardSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function DashboardSidebar({ collapsed, onToggleCollapsed }: DashboardSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("zecflow_access_token");
      localStorage.removeItem("zecflow_refresh_token");
    }
    navigate("/auth");
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 ${collapsed ? "w-16" : "w-64"} border-r border-white/10 bg-black/70 backdrop-blur flex flex-col z-40 transition-[width] duration-200`}
    >
      <div className="h-16 px-3 border-b border-white/10 flex items-center justify-between">
        <img
          src="/zecflow-logo.png"
          alt="ZecFlow"
          className={`${collapsed ? "h-10" : "h-16"} w-auto object-contain transition-all`}
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/60 text-zinc-300 hover:bg-white/10"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === "/dashboard"
              ? location.pathname === "/dashboard" || location.pathname === "/dashboard/"
              : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center ${
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              } py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-violet-500/15 text-violet-200 border border-violet-400/40"
                  : "text-zinc-400 border border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleSignOut}
          className={`w-full flex items-center ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-red-500/10 hover:text-red-300 transition-colors`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
