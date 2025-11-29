export function DashboardCreditsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <h2 className="text-lg font-semibold mb-2">Credits</h2>
        <p className="text-sm text-zinc-300 max-w-xl">
          Monitor spend on runs, Nillion and Zcash.
        </p>
      </div>

      <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
        <p className="text-sm text-zinc-300">Credit history UI coming soon.</p>
        <p className="text-xs text-zinc-500">
          The backend already tracks balances and transactions; this page will surface that data.
        </p>
      </div>
    </div>
  );
}
