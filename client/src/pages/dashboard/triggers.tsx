import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authorizedRequest, ApiError } from "@/lib/api-client";
import { Network, Zap } from "lucide-react";

type TriggerStatus = "active" | "inactive";

type TriggerItem = {
  _id: string;
  name: string;
  type: string;
  status: TriggerStatus;
  connector?: string;
  createdAt?: string;
};

type TriggerDefinition = {
  id: string;
  name: string;
  description: string;
  category: "webhook" | "schedule" | "blockchain" | "social" | "code" | "data";
};

type ConnectorItem = {
  _id: string;
  name: string;
  type: string;
};

type ListTriggersResponse = {
  triggers: TriggerItem[];
};

type ListTriggerDefinitionsResponse = {
  triggers: TriggerDefinition[];
};

type ListConnectorsResponse = {
  connectors: ConnectorItem[];
};

type CreateTriggerResponse = {
  trigger: TriggerItem;
};

type CreateConnectorResponse = {
  connector: {
    _id: string;
    name: string;
    type: string;
  };
};

export function DashboardTriggersPage() {
  const navigate = useNavigate();
  const [triggers, setTriggers] = useState<TriggerItem[]>([]);
  const [definitions, setDefinitions] = useState<TriggerDefinition[]>([]);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [creating, setCreating] = useState(false);
  const [httpPath, setHttpPath] = useState("/");
  const [httpSecret, setHttpSecret] = useState("");
  const [scheduleExpression, setScheduleExpression] = useState("0 * * * *");
  const [zcashMemoPattern, setZcashMemoPattern] = useState("");
  const [zcashMinAmount, setZcashMinAmount] = useState("");
  const [zcashAddress, setZcashAddress] = useState("");
  const [zcashMinConfirmations, setZcashMinConfirmations] = useState("1");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [twitterFilter, setTwitterFilter] = useState("");
  const [twitterEventType, setTwitterEventType] = useState<"posts" | "mentions" | "all">("all");
  const [twitterPollIntervalSec, setTwitterPollIntervalSec] = useState("60");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubIncludePaths, setGithubIncludePaths] = useState("");
  const [githubExcludePaths, setGithubExcludePaths] = useState("");
  const [pollRelativePath, setPollRelativePath] = useState("");
  const [pollMethod, setPollMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("GET");
  const [pollIntervalSec, setPollIntervalSec] = useState("30");
  const [pollMaxBatch, setPollMaxBatch] = useState("50");
  const [schedulePreset, setSchedulePreset] = useState<"every-5-min" | "hourly" | "daily-9" | "custom">("hourly");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [trRes, defRes, connRes] = await Promise.all([
          authorizedRequest<ListTriggersResponse>("/triggers"),
          authorizedRequest<ListTriggerDefinitionsResponse>("/triggers/definitions"),
          authorizedRequest<ListConnectorsResponse>("/connectors"),
        ]);
        if (cancelled) return;
        const list = (trRes.triggers ?? []).slice().sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        });
        setTriggers(list);
        setDefinitions(defRes.triggers ?? []);
        setConnectors(connRes.connectors ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load triggers.");
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
    const map = new Map<string, TriggerDefinition>();
    for (const def of definitions) {
      map.set(def.id, def);
    }
    return map;
  }, [definitions]);

  const connectorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connectors) {
      map.set(c._id, c.name);
    }
    return map;
  }, [connectors]);

  const githubConnectors = useMemo(
    () => connectors.filter((c) => c.type === "github"),
    [connectors],
  );

  const zcashConnectors = useMemo(
    () => connectors.filter((c) => c.type === "zcash-viewkey"),
    [connectors],
  );

  const httpConnectors = useMemo(
    () => connectors.filter((c) => c.type === "custom-http"),
    [connectors],
  );

  function resetForm() {
    setName("");
    setType("");
    setConnectorId("");
    setHttpPath("/");
    setHttpSecret("");
    setSchedulePreset("hourly");
    setScheduleExpression("0 * * * *");
    setZcashMemoPattern("");
    setZcashMinAmount("");
    setZcashAddress("");
    setZcashMinConfirmations("1");
    setTwitterHandle("");
    setTwitterFilter("");
    setTwitterEventType("all");
    setTwitterPollIntervalSec("60");
    setGithubBranch("main");
    setGithubIncludePaths("");
    setGithubExcludePaths("");
    setPollRelativePath("");
    setPollMethod("GET");
    setPollIntervalSec("30");
    setPollMaxBatch("50");
  }

  function handleConnectorSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "__new__") {
      navigate("/dashboard/connectors");
      return;
    }
    setConnectorId(value);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !type) {
      return;
    }

    const config: Record<string, unknown> = {};
    let httpPollBaseUrl: string | null = null;

    if (type === "http-webhook") {
      config.path = httpPath || "/";
      if (httpSecret.trim()) {
        config.secret = httpSecret.trim();
      }
    } else if (type === "schedule") {
      config.expression = scheduleExpression.trim();
    } else if (type === "zcash-transaction") {
      if (zcashMemoPattern.trim()) {
        config.memoPattern = zcashMemoPattern.trim();
      }
      if (zcashMinAmount.trim()) {
        const parsed = Number(zcashMinAmount);
        if (!Number.isNaN(parsed)) {
          config.minAmount = parsed;
        }
      }
      if (zcashAddress.trim()) {
        config.address = zcashAddress.trim();
      }
      const confirmations = Number(zcashMinConfirmations);
      if (!Number.isNaN(confirmations)) {
        config.minConfirmations = confirmations;
      }
    } else if (type === "twitter-post") {
      config.handle = twitterHandle.trim();
      if (twitterFilter.trim()) {
        config.filter = twitterFilter.trim();
      }
      config.eventType = twitterEventType;
      const interval = Number(twitterPollIntervalSec);
      if (!Number.isNaN(interval)) {
        config.pollIntervalSec = interval;
      }
    } else if (type === "github-commit") {
      config.branch = githubBranch.trim() || "main";
      if (githubIncludePaths.trim()) {
        config.includePaths = githubIncludePaths
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
      if (githubExcludePaths.trim()) {
        config.excludePaths = githubExcludePaths
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
    } else if (type === "custom-http-poll") {
      const endpoint = pollRelativePath.trim();
      if (!endpoint) {
        setError("Endpoint URL is required for HTTP poll triggers.");
        return;
      }
      try {
        const url = new URL(endpoint);
        httpPollBaseUrl = url.origin;
        config.relativePath = url.pathname || "/";
        if (url.searchParams.size > 0) {
          const queryParams: Record<string, string> = {};
          url.searchParams.forEach((value, key) => {
            queryParams[key] = value;
          });
          config.queryParams = queryParams;
        }
      } catch {
        setError("Endpoint URL is invalid.");
        return;
      }
      config.method = pollMethod;
      const interval = Number(pollIntervalSec);
      if (!Number.isNaN(interval)) {
        config.pollIntervalSec = interval;
      }
      const maxBatch = Number(pollMaxBatch);
      if (!Number.isNaN(maxBatch)) {
        config.maxBatch = maxBatch;
      }
    }

    try {
      setCreating(true);
      setError(null);

      let connectorIdToUse = connectorId;

      if (type === "custom-http-poll" && !connectorIdToUse && httpPollBaseUrl) {
        try {
          const parsed = new URL(httpPollBaseUrl);
          const connectorName = `HTTP ${parsed.host}`;
          const connRes = await authorizedRequest<CreateConnectorResponse>("/connectors", {
            method: "POST",
            body: JSON.stringify({
              name: connectorName,
              type: "custom-http",
              config: { baseUrl: httpPollBaseUrl },
            }),
          });
          connectorIdToUse = connRes.connector._id;
        } catch {
          // fall back to no connector; backend will validate
        }
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        config,
      };
      if (connectorIdToUse) {
        body.connectorId = connectorIdToUse;
      }

      const res = await authorizedRequest<CreateTriggerResponse>("/triggers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTriggers((prev) => [res.trigger, ...prev]);
      resetForm();
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError("Failed to create trigger.");
      }
    } finally {
      setCreating(false);
    }
  }

  const selectedDefinition = type ? definitionById.get(type) : undefined;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Triggers</h2>
          <p className="text-sm text-zinc-300 max-w-xl">Configure triggers that start new runs.</p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          className="mt-3 md:mt-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <Network className="h-4 w-4" />
          New trigger
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
                placeholder="HTTP webhook for payouts"
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
              {type === "http-webhook" && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">Secret header</label>
                  <input
                    value={httpSecret}
                    onChange={(e) => setHttpSecret(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    placeholder="Optional shared secret"
                  />
                  <p className="text-[11px] text-zinc-500">
                    We&apos;ll expose a POST webhook URL for this trigger after you create it.
                  </p>
                </div>
              )}

              {type === "schedule" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Frequency</label>
                    <select
                      value={schedulePreset}
                      onChange={(e) => {
                        const value = e.target.value as typeof schedulePreset;
                        setSchedulePreset(value);
                        if (value === "every-5-min") {
                          setScheduleExpression("*/5 * * * *");
                        } else if (value === "hourly") {
                          setScheduleExpression("0 * * * *");
                        } else if (value === "daily-9") {
                          setScheduleExpression("0 9 * * *");
                        }
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      <option value="every-5-min">Every 5 minutes</option>
                      <option value="hourly">Every hour</option>
                      <option value="daily-9">Every day at 9am</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Cron expression</label>
                    <input
                      value={scheduleExpression}
                      onChange={(e) => {
                        setScheduleExpression(e.target.value);
                        setSchedulePreset("custom");
                      }}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="*/5 * * * *"
                    />
                    <p className="text-[11px] text-zinc-500">Advanced. We pre-fill this from the preset above.</p>
                  </div>
                </>
              )}

              {type === "zcash-transaction" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Memo pattern</label>
                    <input
                      value={zcashMemoPattern}
                      onChange={(e) => setZcashMemoPattern(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Optional memo substring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Min amount</label>
                    <input
                      value={zcashMinAmount}
                      onChange={(e) => setZcashMinAmount(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Address override</label>
                    <input
                      value={zcashAddress}
                      onChange={(e) => setZcashAddress(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Optional, uses connector address if empty"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Min confirmations</label>
                    <input
                      value={zcashMinConfirmations}
                      onChange={(e) => setZcashMinConfirmations(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                  </div>
                </>
              )}

              {type === "twitter-post" && (
                <>
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
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Filter</label>
                    <input
                      value={twitterFilter}
                      onChange={(e) => setTwitterFilter(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="Optional keyword filter"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Event type</label>
                    <select
                      value={twitterEventType}
                      onChange={(e) => setTwitterEventType(e.target.value as "posts" | "mentions" | "all")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      <option value="all">All</option>
                      <option value="posts">Posts</option>
                      <option value="mentions">Mentions</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Poll interval (sec)</label>
                    <input
                      value={twitterPollIntervalSec}
                      onChange={(e) => setTwitterPollIntervalSec(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                  </div>
                </>
              )}

              {type === "github-commit" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Branch</label>
                    <input
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Include paths</label>
                    <textarea
                      value={githubIncludePaths}
                      onChange={(e) => setGithubIncludePaths(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="One path prefix per line"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Exclude paths</label>
                    <textarea
                      value={githubExcludePaths}
                      onChange={(e) => setGithubExcludePaths(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="One path prefix per line"
                    />
                  </div>
                </>
              )}

              {type === "custom-http-poll" && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Endpoint URL</label>
                    <input
                      value={pollRelativePath}
                      onChange={(e) => setPollRelativePath(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                      placeholder="https://api.example.com/orders?status=pending"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Method</label>
                    <select
                      value={pollMethod}
                      onChange={(e) => setPollMethod(e.target.value as typeof pollMethod)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Poll interval (sec)</label>
                    <input
                      value={pollIntervalSec}
                      onChange={(e) => setPollIntervalSec(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Max batch</label>
                    <input
                      value={pollMaxBatch}
                      onChange={(e) => setPollMaxBatch(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    />
                  </div>
                </>
              )}

              {(type === "github-commit" || type === "custom-http-poll" || type === "zcash-transaction") && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">Connector</label>
                  <select
                    value={connectorId}
                    onChange={handleConnectorSelect}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                  >
                    <option value="">Select connector</option>
                    {(type === "github-commit" ? githubConnectors : type === "custom-http-poll" ? httpConnectors : zcashConnectors).map(
                      (c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ),
                    )}
                    <option value="__new__">New connector…</option>
                  </select>
                </div>
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
              {creating ? "Creating…" : "Create trigger"}
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
      ) : triggers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">No triggers configured yet.</p>
          <p className="text-xs text-zinc-500">
            Create a trigger to start runs from webhooks, schedules, chain events or data.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Connector</th>
                  <th className="px-4 py-3 text-left font-medium">Webhook URL</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {triggers.map((trigger) => {
                  const def = definitionById.get(trigger.type);
                  const createdLabel = trigger.createdAt
                    ? new Date(trigger.createdAt).toLocaleString()
                    : "—";
                  const statusLabel = trigger.status === "active" ? "Active" : "Inactive";
                  const statusStyles =
                    trigger.status === "active"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-zinc-700/40 text-zinc-200 border-zinc-500/50";
                  const connectorName = trigger.connector
                    ? connectorNameById.get(String(trigger.connector))
                    : undefined;
                  const webhookUrl =
                    origin && trigger.type === "http-webhook"
                      ? `${origin}/api/triggers/hooks/${trigger._id}`
                      : null;

                  return (
                    <tr key={trigger._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
                            <Network className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-white">{trigger.name}</div>
                            <div className="text-xs text-zinc-400">{trigger.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {def ? def.name : trigger.type}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyles}`}
                        >
                          {trigger.status === "active" && <Zap className="h-3 w-3" />}
                          <span>{statusLabel}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {connectorName ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 break-all">
                        {webhookUrl ? webhookUrl : "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400 whitespace-nowrap">
                        {createdLabel}
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
