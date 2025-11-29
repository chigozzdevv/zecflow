export function DashboardRunsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <h2 className="text-lg font-semibold mb-2">Runs</h2>
        <p className="text-sm text-zinc-300 max-w-xl">
          See workflow runs and outcomes.
        </p>
      </div>

      <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
        <p className="text-sm text-zinc-300">No runs to show yet.</p>
        <p className="text-xs text-zinc-500">
          After you publish a workflow and add a trigger, new executions will show up here.
        </p>
      </div>
    </div>
  );
}
