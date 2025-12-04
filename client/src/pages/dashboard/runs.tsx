import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";

type DemoRunRecord = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "pending" | "running" | "succeeded" | "failed";
  createdAt: string | null;
  stateKey?: string | null;
  resultKey?: string | null;
  shielded?: boolean;
};

type DemoRunsResponse = {
  runs: DemoRunRecord[];
};

const statusClasses: Record<DemoRunRecord["status"], string> = {
  succeeded: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  running: "bg-amber-500/15 text-amber-200 border border-amber-500/30",
  pending: "bg-zinc-500/15 text-zinc-200 border border-zinc-400/30",
};

const formatTimestamp = (value: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function DashboardRunsPage() {
  const [runs, setRuns] = useState<DemoRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    request<DemoRunsResponse>("/demo/runs?limit=50")
      .then((data) => {
        if (cancelled) return;
        setRuns(data.runs ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load runs");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <h2 className="text-lg font-semibold mb-2">Runs</h2>
        <p className="text-sm text-zinc-300 max-w-xl">
          Latest executions from the published demo workflows.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-0 overflow-hidden">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-red-300">{error}</div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-400">
            No runs recorded yet. Trigger a demo workflow to populate this list.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {runs.map((run) => (
              <li key={run.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{run.workflowName}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{formatTimestamp(run.createdAt)}</div>
                  <div className="text-[11px] text-zinc-500 mt-1 space-y-0.5">
                    {run.stateKey && <div>State key: {run.stateKey}</div>}
                    {run.resultKey && <div>Result key: {run.resultKey}</div>}
                    {run.shielded && <div>Shielded output stored in NilDB</div>}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusClasses[run.status]}`}>
                  {run.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
