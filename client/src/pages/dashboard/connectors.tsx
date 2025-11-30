import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plug, Trash2 } from "lucide-react";
import { authorizedRequest, ApiError } from "@/lib/api-client";

type ConnectorItem = {
  _id: string;
  name: string;
  type: string;
  createdAt?: string;
};

type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  category: "webhook" | "code" | "social" | "data";
};

type ListConnectorsResponse = {
  connectors: ConnectorItem[];
};

type ListConnectorDefinitionsResponse = {
  connectors: ConnectorDefinition[];
};

type CreateConnectorResponse = {
  connector: ConnectorItem;
};

export function DashboardConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [definitions, setDefinitions] = useState<ConnectorDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [zcashAddress, setZcashAddress] = useState("");
  const [zcashViewingKey, setZcashViewingKey] = useState("");
  const [zcashLabel, setZcashLabel] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubRepository, setGithubRepository] = useState("");
  const [githubWebhookSecret, setGithubWebhookSecret] = useState("");
  const [twitterBearerToken, setTwitterBearerToken] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [customHttpAuthMode, setCustomHttpAuthMode] = useState<"none" | "bearer" | "api-key" | "custom">("none");
  const [customHttpAuthValue, setCustomHttpAuthValue] = useState("");
  const [customHttpHeaderName, setCustomHttpHeaderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [connRes, defRes] = await Promise.all([
          authorizedRequest<ListConnectorsResponse>("/connectors"),
          authorizedRequest<ListConnectorDefinitionsResponse>("/connectors/definitions"),
        ]);
        if (cancelled) return;
        const list = (connRes.connectors ?? []).slice().sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        });
        setConnectors(list);
        setDefinitions(defRes.connectors ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load connectors.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const definitionById = useMemo(() => {
    const map = new Map<string, ConnectorDefinition>();
    for (const def of definitions) {
      map.set(def.id, def);
    }
    return map;
  }, [definitions]);

  function resetForm() {
    setName("");
    setType("");
    setWebhookSecret("");
    setBaseUrl("");
    setZcashAddress("");
    setZcashViewingKey("");
    setZcashLabel("");
    setGithubToken("");
    setGithubRepository("");
    setGithubWebhookSecret("");
    setTwitterBearerToken("");
    setTwitterHandle("");
    setCustomHttpAuthMode("none");
    setCustomHttpAuthValue("");
    setCustomHttpHeaderName("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !type) {
      return;
    }

    const config: Record<string, unknown> = {};

    if (type === "webhook-receiver") {
      if (webhookSecret.trim()) {
        config.secret = webhookSecret.trim();
      }
    } else if (type === "custom-http") {
      config.baseUrl = baseUrl.trim();
      const mode = customHttpAuthMode;
      const value = customHttpAuthValue.trim();
      const name = customHttpHeaderName.trim();
      const headers: Record<string, string> = {};

      if (mode === "bearer" && value) {
        headers["Authorization"] = `Bearer ${value}`;
      } else if (mode === "api-key" && value) {
        headers["X-Api-Key"] = value;
      } else if (mode === "custom" && name && value) {
        headers[name] = value;
      }

      if (Object.keys(headers).length > 0) {
        config.headers = headers;
      }
    } else if (type === "zcash-viewkey") {
      config.address = zcashAddress.trim();
      config.viewingKey = zcashViewingKey.trim();
      if (zcashLabel.trim()) {
        config.label = zcashLabel.trim();
      }
    } else if (type === "github") {
      config.token = githubToken.trim();
      config.repository = githubRepository.trim();
      config.webhookSecret = githubWebhookSecret.trim();
      config.events = ["push"];
    } else if (type === "twitter") {
      config.bearerToken = twitterBearerToken.trim();
      config.handle = twitterHandle.trim();
    }

    try {
      setCreating(true);
      setError(null);
      const res = await authorizedRequest<CreateConnectorResponse>("/connectors", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          config,
        }),
      });
      setConnectors((prev) => [res.connector, ...prev]);
      resetForm();
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to create connector.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      setError(null);
      await authorizedRequest<void>(`/connectors/${id}`, { method: "DELETE" });
      setConnectors((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to delete connector.");
      }
    } finally {
      setDeletingId((current) => (current === id ? null : current));
    }
  }

  const selectedDefinition = type ? definitionById.get(type) : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Connectors</h2>
          <p className="text-sm text-zinc-300 max-w-xl">
            Configure APIs and Zcash/Nil services used by your blocks.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="mt-3 md:mt-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <Plug className="h-4 w-4" />
          New connector
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
                placeholder="Production Zcash node"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
              >
                <option value="">Select type</option>
                {definitions.map((def) => (
                  <option key={def.id} value={def.id}>
                    {def.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-xs text-zinc-400">
              <div className="font-medium text-zinc-300">Details</div>
              <div className="min-h-[2.5rem]">
                {selectedDefinition ? selectedDefinition.description : "Choose a type to see details."}
              </div>
            </div>
          </div>

          {type && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {type === "webhook-receiver" && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">Webhook secret</label>
                  <input
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    placeholder="Optional secret header"
                  />
                </div>
              )}

              {type === "custom-http" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Base URL</label>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="https://api.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Auth / header</label>
                    <select
                      value={customHttpAuthMode}
                      onChange={(e) => setCustomHttpAuthMode(e.target.value as any)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      <option value="none">None</option>
                      <option value="bearer">Authorization: Bearer &lt;token&gt;</option>
                      <option value="api-key">X-Api-Key</option>
                      <option value="custom">Custom header</option>
                    </select>
                  </div>
                  {customHttpAuthMode !== "none" && (
                    <div className="space-y-2">
                      {customHttpAuthMode === "custom" && (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-zinc-300">Header name</label>
                          <input
                            value={customHttpHeaderName}
                            onChange={(e) => setCustomHttpHeaderName(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                            placeholder="X-Custom-Header"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-zinc-300">
                          {customHttpAuthMode === "bearer"
                            ? "Token"
                            : customHttpAuthMode === "api-key"
                            ? "API key value"
                            : "Header value"}
                        </label>
                        <input
                          value={customHttpAuthValue}
                          onChange={(e) => setCustomHttpAuthValue(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                          placeholder={
                            customHttpAuthMode === "bearer"
                              ? "your-jwt-or-api-token"
                              : customHttpAuthMode === "api-key"
                              ? "your-api-key"
                              : "header value"
                          }
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {type === "zcash-viewkey" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Shielded address</label>
                    <input
                      value={zcashAddress}
                      onChange={(e) => setZcashAddress(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="z..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Viewing key</label>
                    <input
                      value={zcashViewingKey}
                      onChange={(e) => setZcashViewingKey(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="View key from node or wallet"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Label</label>
                    <input
                      value={zcashLabel}
                      onChange={(e) => setZcashLabel(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Optional label"
                    />
                  </div>
                </>
              )}

              {type === "github" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Token</label>
                    <input
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="GitHub personal access token"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Repository</label>
                    <input
                      value={githubRepository}
                      onChange={(e) => setGithubRepository(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="owner/repo"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Webhook secret</label>
                    <input
                      value={githubWebhookSecret}
                      onChange={(e) => setGithubWebhookSecret(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Secret shared with GitHub webhook"
                    />
                  </div>
                </>
              )}

              {type === "twitter" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Bearer token</label>
                    <input
                      value={twitterBearerToken}
                      onChange={(e) => setTwitterBearerToken(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Twitter API bearer token"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Handle</label>
                    <input
                      value={twitterHandle}
                      onChange={(e) => setTwitterHandle(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="@handle"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetForm();
                setShowCreate(false);
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Creating…" : "Create connector"}
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
      ) : connectors.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">No connectors added yet.</p>
          <p className="text-xs text-zinc-500">Create a connector to reuse credentials and endpoints across workflows.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {connectors.map((connector) => {
                  const def = definitionById.get(connector.type);
                  const createdLabel = connector.createdAt
                    ? new Date(connector.createdAt).toLocaleString()
                    : "—";

                  return (
                    <tr key={connector._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
                            <Plug className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-white">{connector.name}</div>
                            <div className="text-xs text-zinc-400">{connector.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {def ? def.name : connector.type}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {def ? def.category : ""}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 whitespace-nowrap">
                        {createdLabel}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(connector._id)}
                          disabled={deletingId === connector._id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
