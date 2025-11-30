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

type FieldType = "string" | "number" | "boolean";

type DraftField = {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
};

export function DashboardDatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<DraftField[]>([
    { id: "f1", name: "", type: "string", required: true },
  ]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DatasetItem | null>(null);

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

    const activeFields = fields.filter((f) => f.name.trim());
    if (activeFields.length === 0) {
      setError("Add at least one field.");
      return;
    }

    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const f of activeFields) {
      properties[f.name.trim()] = { type: f.type };
      if (f.required) required.push(f.name.trim());
    }

    const schema = {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    };

    try {
      setCreating(true);
      setError(null);
      const res = await authorizedRequest<CreateDatasetResponse>("/datasets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), schema }),
      });
      setDatasets((prev) => [res.dataset, ...prev]);
      setName("");
      setFields([{ id: "f1", name: "", type: "string", required: true }]);
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
          <div className="space-y-4">
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
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Fields</label>
              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 items-center"
                  >
                    <input
                      value={field.name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFields((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, name: value } : f)),
                        );
                      }}
                      placeholder="field name"
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => {
                        const value = e.target.value as FieldType;
                        setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, type: value } : f)));
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => {
                          const value = e.target.checked;
                          setFields((prev) =>
                            prev.map((f, i) => (i === idx ? { ...f, required: value } : f)),
                          );
                        }}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setFields((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
                        )
                      }
                      className="text-xs text-zinc-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setFields((prev) => [
                      ...prev,
                      { id: `f${prev.length + 1}`, name: "", type: "string", required: false },
                    ])
                  }
                  className="text-xs text-zinc-300 hover:text-white"
                >
                  + Add field
                </button>
              </div>
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
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {datasets.map((ds) => {
                  const createdLabel = ds.createdAt ? new Date(ds.createdAt).toLocaleString() : "—";
                  const schema = (ds.schema ?? {}) as any;
                  const properties = schema && typeof schema === "object" ? (schema.properties as any) : undefined;
                  const fieldCount = properties && typeof properties === "object" ? Object.keys(properties).length : 0;
                  const statusStyles =
                    ds.status === "active"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-zinc-700/40 text-zinc-200 border-zinc-500/50";

                  return (
                    <tr key={ds._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-top text-sm text-white">
                        <div className="flex flex-col">
                          <span>{ds.name}</span>
                          <span className="text-[11px] text-zinc-400">{fieldCount} field{fieldCount === 1 ? '' : 's'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyles}`}
                        >
                          <span className="capitalize">{ds.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 whitespace-nowrap">{createdLabel}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(ds)}
                          className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                <p className="text-xs text-zinc-400">Dataset schema</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="border border-zinc-800 rounded-xl bg-black/40 p-3 max-h-72 overflow-y-auto text-xs">
              {(() => {
                const schema = (selected.schema ?? {}) as any;
                const properties = schema && typeof schema === "object" ? (schema.properties as any) : undefined;
                const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
                const entries = properties && typeof properties === "object" ? Object.entries(properties as any) : [];
                if (!entries.length) return <p className="text-zinc-500">No fields defined.</p>;
                return (
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-zinc-400">
                      <tr>
                        <th className="py-1 pr-2">Field</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([name, def]: any) => (
                        <tr key={name} className="border-t border-zinc-800">
                          <td className="py-1 pr-2 text-zinc-100">{name}</td>
                          <td className="py-1 pr-2 text-zinc-300">{def?.type ?? 'unknown'}</td>
                          <td className="py-1 pr-2 text-zinc-300">{required.includes(name) ? 'yes' : 'no'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
