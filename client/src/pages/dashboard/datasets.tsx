import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authorizedRequest, ApiError } from "@/lib/api-client";

type DatasetStatus = "active" | "deprecated";

type DatasetItem = {
  _id: string;
  name: string;
  status: DatasetStatus;
  createdAt?: string;
  schema?: unknown;
};

type ListDatasetsResponse = {
  datasets: DatasetItem[];
};

type CreateDatasetResponse = {
  dataset: DatasetItem;
};

export function DashboardDatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [schemaText, setSchemaText] = useState("{\n  \"type\": \"object\",\n  \"properties\": {}\n}");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await authorizedRequest<ListDatasetsResponse>("/datasets");
        if (cancelled) return;
        setDatasets(res.datasets ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load datasets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(schemaText || "{}");
    } catch {
      setError("Schema must be valid JSON.");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await authorizedRequest<CreateDatasetResponse>("/datasets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), schema: parsed }),
      });
      setDatasets((prev) => [res.dataset, ...prev]);
      setName("");
      setSchemaText("{\n  \"type\": \"object\",\n  \"properties\": {}\n}");
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to create dataset.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Datasets</h2>
          <p className="text-sm text-zinc-300 max-w-xl">Define schemas for encrypted inputs to your workflows.</p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="mt-3 md:mt-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          New dataset
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-white/10 bg-zinc-900/80 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                placeholder="Loan applications"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Schema (JSON)</label>
              <textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Creating…" : "Create dataset"}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        </div>
      ) : datasets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">No datasets yet.</p>
          <p className="text-xs text-zinc-500">Create a dataset to define the schema for your encrypted inputs.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {datasets.map((ds) => {
                  const createdLabel = ds.createdAt ? new Date(ds.createdAt).toLocaleString() : "—";
                  const statusStyles =
                    ds.status === "active"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-zinc-700/40 text-zinc-200 border-zinc-500/50";

                  return (
                    <tr key={ds._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-top text-sm text-white">{ds.name}</td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyles}`}
                        >
                          <span className="capitalize">{ds.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 whitespace-nowrap">{createdLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
