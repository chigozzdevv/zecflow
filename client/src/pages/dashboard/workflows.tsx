import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Database, Network, Plus, Trash2, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { authorizedRequest, ApiError } from "@/lib/api-client";
import { useNavigate } from "react-router-dom";

type WorkflowStatus = "draft" | "published" | "paused";

type WorkflowItem = {
  _id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  trigger?: string;
  createdAt?: string;
};

type TriggerItem = {
  _id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
};

type ListWorkflowsResponse = {
  workflows: WorkflowItem[];
};

type ListTriggersResponse = {
  triggers: TriggerItem[];
};

type DatasetItem = {
  _id: string;
  name: string;
  status: "active" | "deprecated";
};

type ListDatasetsResponse = {
  datasets: DatasetItem[];
};

type CreateWorkflowResponse = {
  workflow: WorkflowItem;
};

type PublishWorkflowResponse = {
  workflow: WorkflowItem;
  integrationSnippet?: string;
};

export function DashboardWorkflowsPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [triggers, setTriggers] = useState<TriggerItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerId, setTriggerId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [integrationSnippet, setIntegrationSnippet] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setError(null);
        const [wfRes, trRes, dsRes] = await Promise.all([
          authorizedRequest<ListWorkflowsResponse>("/workflows"),
          authorizedRequest<ListTriggersResponse>("/triggers"),
          authorizedRequest<ListDatasetsResponse>("/datasets"),
        ]);
        if (cancelled) return;
        const list = (wfRes.workflows ?? []).slice().sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        });
        setWorkflows(list);
        setTriggers(trRes.triggers ?? []);
        setDatasets((dsRes.datasets ?? []).filter((d) => d.status === "active"));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load workflows.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerById = useMemo(() => {
    const map = new Map<string, TriggerItem>();
    for (const t of triggers) {
      map.set(t._id, t);
    }
    return map;
  }, [triggers]);

  function describeTrigger(workflow: WorkflowItem): string {
    if (!workflow.trigger) return "None";
    const trigger = triggerById.get(workflow.trigger);
    if (!trigger) return "None";
    const statusLabel = trigger.status === "active" ? "active" : "inactive";
    return `${trigger.name} · ${trigger.type} · ${statusLabel}`;
  }

  function handleTriggerSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "__new__") {
      navigate("/dashboard/triggers");
      return;
    }
    setTriggerId(value);
  }

  function handleDatasetSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "__new__") {
      navigate("/dashboard/datasets");
      return;
    }
    setDatasetId(value);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const res = await authorizedRequest<CreateWorkflowResponse>("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          triggerId: triggerId || undefined,
          datasetId: datasetId || undefined,
        }),
      });
      setWorkflows((prev) => [res.workflow, ...prev]);
      setName("");
      setDescription("");
      setTriggerId("");
      setDatasetId("");
      setShowCreate(false);
      navigate("/dashboard/workflow", { state: { workflowId: res.workflow._id } });
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to create workflow.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(id: string) {
    try {
      setPublishingId(id);
      setError(null);
      const res = await authorizedRequest<PublishWorkflowResponse>(`/workflows/${id}/publish`, {
        method: "POST",
      });
      setWorkflows((prev) => prev.map((w) => (w._id === id ? res.workflow : w)));
      setIntegrationSnippet(res.integrationSnippet ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to publish workflow.");
      }
    } finally {
      setPublishingId((current) => (current === id ? null : current));
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      setError(null);
      await authorizedRequest<void>(`/workflows/${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w._id !== id));
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to delete workflow.");
      }
    } finally {
      setDeletingId((current) => (current === id ? null : current));
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Workflows</h2>
          <p className="text-sm text-zinc-300 max-w-xl">
            Create workflows that connect triggers, blocks and Zcash.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="mt-3 md:mt-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          New workflow
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-white/10 bg-zinc-900/80 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                placeholder="Send shielded payouts"
              />
              <label className="block text-xs font-medium text-zinc-300 mt-3">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                placeholder="Optional context for your team"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Dataset</label>
              <select
                value={datasetId}
                onChange={handleDatasetSelect}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
              >
                <option value="">No dataset</option>
                {datasets.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
                <option value="__new__">New dataset…</option>
              </select>
              <label className="block text-xs font-medium text-zinc-300 mt-3">Trigger</label>
              <select
                value={triggerId}
                onChange={handleTriggerSelect}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
              >
                <option value="">No trigger</option>
                {triggers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} · {t.type} {t.status === "active" ? "(active)" : "(inactive)"}
                  </option>
                ))}
                <option value="__new__">New trigger…</option>
              </select>
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
              {creating ? "Creating…" : "Create workflow"}
            </Button>
          </div>
        </form>
      )}

      {integrationSnippet && (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-300">Integration snippet</p>
            <button
              type="button"
              onClick={() => setIntegrationSnippet(null)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Hide
            </button>
          </div>
          <pre className="text-[11px] whitespace-pre overflow-x-auto bg-black/40 rounded-lg p-3 border border-zinc-800">
            <code>{integrationSnippet}</code>
          </pre>
        </div>
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
      ) : workflows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">You have no workflows yet.</p>
          <p className="text-xs text-zinc-500">
            Create a workflow to start chaining triggers, blocks and Zcash or Nillion actions together.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Trigger</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {workflows.map((workflow) => {
                  const createdLabel = workflow.createdAt
                    ? new Date(workflow.createdAt).toLocaleString()
                    : "—";
                  const status = workflow.status;
                  const statusStyles =
                    status === "published"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : status === "paused"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                      : "bg-zinc-700/40 text-zinc-200 border-zinc-500/50";

                  return (
                    <tr key={workflow._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
                            <WorkflowIcon className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{workflow.name}</span>
                            {workflow.description && (
                              <span className="text-xs text-zinc-400 max-w-xs truncate">{workflow.description}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyles}`}
                        >
                          {status === "published" && <Zap className="h-3 w-3" />}
                          {status === "draft" && <Database className="h-3 w-3" />}
                          {status === "paused" && <Network className="h-3 w-3" />}
                          <span className="capitalize">{status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {describeTrigger(workflow)}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 whitespace-nowrap">
                        {createdLabel}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => navigate("/dashboard/workflow", { state: { workflowId: workflow._id } })}
                          >
                            Edit
                          </Button>
                          {workflow.status !== "published" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={publishingId === workflow._id}
                              onClick={() => handlePublish(workflow._id)}
                            >
                              {publishingId === workflow._id ? "Publishing…" : "Publish"}
                            </Button>
                          )}
                          {workflow.status === "draft" && (
                            <button
                              type="button"
                              onClick={() => handleDelete(workflow._id)}
                              disabled={deletingId === workflow._id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
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
