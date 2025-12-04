import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Workflow, Zap, Network } from "lucide-react";
import { authorizedRequest, ApiError, request } from "@/lib/api-client";

type WorkflowStatus = "draft" | "published" | "paused";

type WorkflowItem = {
  _id: string;
  name: string;
  status: WorkflowStatus;
  createdAt?: string;
};

type TriggerItem = {
  _id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
};

type ConnectorItem = {
  _id: string;
  name: string;
  type: string;
};

type WorkloadItem = {
  _id: string;
  name: string;
};

type RunStatus = "pending" | "running" | "succeeded" | "failed";

type RunItem = {
  id: string;
  status: RunStatus;
  createdAt?: string | null;
  workflowName?: string | null;
};

type RunsResponse = {
  runs: Array<{
    _id?: string;
    id?: string;
    status: RunStatus;
    createdAt?: string | null;
    workflow?: string;
    workflowId?: string;
    workflowName?: string | null;
  }>;
};

const normalizeRuns = (items: RunsResponse["runs"], fallbackName: string | null): RunItem[] => {
  return (items ?? [])
    .map((run, idx) => {
      const idRaw = run._id ?? run.id ?? `${idx}`;
      const id = typeof idRaw === "string" ? idRaw : String(idRaw);
      return {
        id,
        status: (run.status ?? "pending") as RunStatus,
        createdAt: run.createdAt ?? null,
        workflowName: run.workflowName ?? fallbackName ?? null,
      } satisfies RunItem;
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return aTime - bTime;
    })
    .slice(-20);
};

type DashboardMetrics = {
  workflowsTotal: number;
  workflowsPublished: number;
  triggersTotal: number;
  triggersActive: number;
  connectorsTotal: number;
  workloadsTotal: number;
};

const initialMetrics: DashboardMetrics = {
  workflowsTotal: 0,
  workflowsPublished: 0,
  triggersTotal: 0,
  triggersActive: 0,
  connectorsTotal: 0,
  workloadsTotal: 0,
};

export function DashboardOverviewPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [primaryWorkflowId, setPrimaryWorkflowId] = useState<string | null>(null);
  const [primaryWorkflowName, setPrimaryWorkflowName] = useState<string | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<RunItem[]>([]);
  const [workflowRunsLoading, setWorkflowRunsLoading] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState<string | null>(null);
  const [demoRuns, setDemoRuns] = useState<RunItem[]>([]);
  const [demoRunsLoading, setDemoRunsLoading] = useState(true);
  const [demoRunsError, setDemoRunsError] = useState<string | null>(null);
  const [workflowsResolved, setWorkflowsResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [workflowsRes, triggersRes, connectorsRes, workloadsRes] = await Promise.all([
          authorizedRequest<{ workflows: WorkflowItem[] }>("/workflows"),
          authorizedRequest<{ triggers: TriggerItem[] }>("/triggers"),
          authorizedRequest<{ connectors: ConnectorItem[] }>("/connectors"),
          authorizedRequest<{ workloads: WorkloadItem[] }>("/nillion/workloads"),
        ]);

        if (cancelled) return;

        const workflows = workflowsRes.workflows ?? [];
        const triggers = triggersRes.triggers ?? [];
        const connectors = connectorsRes.connectors ?? [];
        const workloads = workloadsRes.workloads ?? [];

        const publishedWorkflows = workflows.filter((w) => w.status === "published").length;
        const activeTriggers = triggers.filter((t) => t.status === "active").length;

        setMetrics({
          workflowsTotal: workflows.length,
          workflowsPublished: publishedWorkflows,
          triggersTotal: triggers.length,
          triggersActive: activeTriggers,
          connectorsTotal: connectors.length,
          workloadsTotal: workloads.length,
        });

        const primary =
          workflows.find((w) => w.status === "published") ?? workflows[0] ?? null;
        setPrimaryWorkflowId(primary ? primary._id : null);
        setPrimaryWorkflowName(primary ? primary.name : null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // DashboardLayout will handle redirect on auth failure
          return;
        }
        setError("We couldn't load your dashboard overview.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setWorkflowsResolved(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

useEffect(() => {
  let cancelled = false;
  setDemoRunsLoading(true);
  setDemoRunsError(null);

  request<RunsResponse>("/demo/runs?limit=40")
    .then((res) => {
      if (!cancelled) {
        setDemoRuns(normalizeRuns(res.runs ?? [], "Demo workflow"));
      }
    })
    .catch(() => {
      if (!cancelled) {
        setDemoRunsError("We couldn't load demo runs.");
      }
    })
    .finally(() => {
      if (!cancelled) {
        setDemoRunsLoading(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  if (!workflowsResolved || !primaryWorkflowId) {
    setWorkflowRuns([]);
    return;
  }

  let cancelled = false;

  async function loadWorkflowRuns() {
    try {
      setWorkflowRunsLoading(true);
      setWorkflowRunsError(null);
      const res = await authorizedRequest<RunsResponse>(
        `/runs?workflowId=${encodeURIComponent(primaryWorkflowId!)}`,
      );
      if (cancelled) return;
      setWorkflowRuns(normalizeRuns(res.runs ?? [], primaryWorkflowName));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
      setWorkflowRunsError("We couldn't load runs for this workflow.");
    } finally {
      if (!cancelled) {
        setWorkflowRunsLoading(false);
      }
    }
  }

  loadWorkflowRuns();
  return () => {
    cancelled = true;
  };
}, [primaryWorkflowId, primaryWorkflowName, workflowsResolved]);

const workflowHasSuccess = workflowRuns.some((run) => run.status === "succeeded");
const shouldPreferWorkflowRuns =
  workflowRuns.length > 0 && (workflowHasSuccess || demoRuns.length === 0);

const displayedRuns = shouldPreferWorkflowRuns ? workflowRuns : demoRuns;
const runsLoading = shouldPreferWorkflowRuns ? workflowRunsLoading : demoRunsLoading;
const runsError = shouldPreferWorkflowRuns ? workflowRunsError : demoRunsError;

  const succeeded = displayedRuns.filter((r) => r.status === "succeeded").length;
  const failed = displayedRuns.filter((r) => r.status === "failed").length;
  const inProgress = displayedRuns.filter(
    (r) => r.status === "pending" || r.status === "running",
  ).length;
  const successRate = displayedRuns.length ? Math.round((succeeded / displayedRuns.length) * 100) : null;

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 animate-pulse"
            >
              <div className="h-10 w-10 rounded-xl bg-white/10 mb-4" />
              <div className="h-6 w-20 rounded-md bg-white/10 mb-2" />
              <div className="h-4 w-24 rounded-md bg-white/5" />
            </div>
          ))}
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={Workflow}
            label="Workflows"
            value={metrics.workflowsTotal}
            highlight={
              metrics.workflowsPublished > 0
                ? `${metrics.workflowsPublished} published`
                : "No published flows yet"
            }
            iconClassName="text-violet-400"
          />
          <StatCard
            icon={Network}
            label="Triggers"
            value={metrics.triggersTotal}
            highlight={
              metrics.triggersActive > 0
                ? `${metrics.triggersActive} active`
                : "No active triggers"
            }
            iconClassName="text-sky-400"
          />
          <StatCard
            icon={Database}
            label="Connectors"
            value={metrics.connectorsTotal}
            highlight={
              metrics.connectorsTotal > 0
                ? "Connected services"
                : "No connectors yet"
            }
            iconClassName="text-emerald-400"
          />
          <StatCard
            icon={Zap}
            label="Recent runs"
            value={displayedRuns.length}
            highlight={
              displayedRuns.length > 0
                ? `${succeeded} succeeded · ${failed} failed` + (inProgress > 0 ? ` · ${inProgress} in progress` : "")
                : "No runs recorded yet"
            }
            iconClassName="text-amber-400"
          />
        </section>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-zinc-900/90 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Run success over time</h2>
              <p className="text-xs text-zinc-400 mt-1">
                {shouldPreferWorkflowRuns && primaryWorkflowId && primaryWorkflowName
                  ? `Latest runs for "${primaryWorkflowName}"`
                  : "Latest runs from demo workflows."}
              </p>
            </div>
            {successRate !== null && (
              <div className="text-right">
                <div className="text-2xl font-semibold text-emerald-300">
                  {successRate}
                  <span className="text-sm text-zinc-400 ml-1">%</span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  success rate (last {displayedRuns.length || 0} runs)
                </div>
              </div>
            )}
          </div>
          {runsLoading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
            </div>
          ) : displayedRuns.length === 0 ? (
            <div className="h-24 flex items-center justify-center">
              <p className="text-xs text-zinc-500">
                No runs yet. Publish a workflow and trigger it to see success vs failed runs here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
                <span>{succeeded} succeeded</span>
                <span>{failed} failed</span>
                {inProgress > 0 && <span>{inProgress} in progress</span>}
              </div>
              <div className="relative h-24 flex items-center">
                <div className="absolute left-0 right-0 h-px bg-zinc-700/80" />
                <div className="relative z-10 flex w-full gap-1">
                  {displayedRuns.map((run, idx) => {
                    const colorClasses =
                      run.status === "succeeded"
                        ? "bg-emerald-400 border-emerald-300"
                        : run.status === "failed"
                        ? "bg-rose-500 border-rose-400"
                        : "bg-zinc-500 border-zinc-400";
                    return (
                      <div key={run.id ?? idx} className="flex-1 flex flex-col items-center">
                        <div className="flex-1 flex items-center justify-center">
                          <div className={`w-2.5 h-2.5 rounded-full border ${colorClasses}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {runsError && (
            <div className="mt-3 text-[11px] text-red-300 bg-red-950/40 border border-red-500/40 rounded-md px-3 py-2">
              {runsError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-5 space-y-3">
            <h2 className="text-sm font-semibold mb-1">Next actions</h2>
            <QuickAction
              icon={Workflow}
              label="Create a workflow"
              description="Create a workflow that ties your triggers and blocks together."
              onClick={() => navigate("/dashboard/workflows")}
            />
            <QuickAction
              icon={Network}
              label="Add a trigger"
              description="Add a trigger that starts new runs."
              onClick={() => navigate("/dashboard/triggers")}
            />
            <QuickAction
              icon={Database}
              label="Configure a connector"
              description="Connect external APIs or Zcash RPC used inside blocks."
              onClick={() => navigate("/dashboard/connectors")}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

type StatCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  highlight: string;
  iconClassName?: string;
};

function StatCard({ icon: Icon, label, value, highlight, iconClassName }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/90 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/70">{label}</span>
          <span className="text-2xl font-semibold">{value}</span>
        </div>
        <div className="h-10 w-10 rounded-2xl bg-black/30 border border-white/20 flex items-center justify-center">
          <Icon className={`h-5 w-5 ${iconClassName ?? "text-violet-400"}`} />
        </div>
      </div>
      <p className="text-xs text-white/80">{highlight}</p>
      <div className="pointer-events-none absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent" />
    </div>
  );
}

type QuickActionProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
};

function QuickAction({ icon: Icon, label, description, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10 hover:border-white/20 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold mb-0.5">{label}</div>
          <p className="text-[11px] text-zinc-300 leading-snug">{description}</p>
        </div>
      </div>
    </button>
  );
}
