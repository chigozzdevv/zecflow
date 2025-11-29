import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { authorizedRequest, ApiError } from "@/lib/api-client";

type OrganizationResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

type CreditsResponse = {
  credits: number;
};

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => location.pathname === "/dashboard/workflow",
  );

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("zecflow_access_token") : null;
    if (!token) {
      navigate("/auth");
      return;
    }

    let cancelled = false;

    async function loadHeaderData() {
      try {
        const [orgRes, creditsRes] = await Promise.all([
          authorizedRequest<OrganizationResponse>("/auth/organization"),
          authorizedRequest<CreditsResponse>("/billing/credits"),
        ]);

        if (cancelled) return;
        setOrganizationName(orgRes.organization.name);
        setCredits(creditsRes.credits ?? null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("zecflow_access_token");
            localStorage.removeItem("zecflow_refresh_token");
          }
          navigate("/auth");
        }
      }
    }

    loadHeaderData();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white flex">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div
        className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-200 ${
          sidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        <header className="border-b border-white/10 bg-black/80 backdrop-blur">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-sm text-white/90">
                  {organizationName || "Org"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {credits !== null && (
                <div className="flex items-center gap-2 rounded-full bg-black/40 border border-white/20 px-3 py-1">
                  <Wallet className="h-3 w-3 text-emerald-300" />
                  <span className="text-white/70">Credits</span>
                  <span className="font-semibold text-emerald-300">{credits}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-white/70 hover:bg-white/10 hover:text-white text-xs transition-colors"
              >
                Back to site
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
