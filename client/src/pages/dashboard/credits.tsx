import { useEffect, useMemo, useState } from "react";
import { authorizedRequest, ApiError } from "@/lib/api-client";
import { Coins, ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";

type CreditsResponse = { credits: number };
type CostsResponse = { costs: Record<string, number> };
type TransactionsResponse = { transactions: CreditTransaction[] };

type CreditTransaction = {
  _id: string;
  type: "debit" | "credit";
  amount: number;
  operation?: string;
  reason?: string;
  balanceAfter?: number;
  createdAt?: string;
};

const OPERATION_LABELS: Record<string, string> = {
  "workflow-run": "Workflow run",
  "nillion-compute": "NilCC compute",
  "nillion-block-graph": "Graph execution",
  "nillion-math-logic": "Secure math/logic",
  "nilai-llm": "NilAI inference",
  "state-store": "State store",
  "state-read": "State read",
  "zcash-send": "Zcash send",
  "connector-request": "Connector request",
  "custom-http-action": "Custom HTTP action",
};

const OPERATION_DESCRIPTIONS: Record<string, string> = {
  "workflow-run": "Base cost applied whenever a workflow executes",
  "nillion-compute": "Charge for NilCC blocks that execute MPC",
  "nilai-llm": "Credits consumed per NilAI completion",
  "zcash-send": "Shielded Zcash transfer fees",
};

function formatDate(iso?: string): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatOperation(op?: string): string {
  if (!op) return "Adjustment";
  return OPERATION_LABELS[op] ?? op;
}

export function DashboardCreditsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [creditsRes, costsRes, txRes] = await Promise.all([
          authorizedRequest<CreditsResponse>("/billing/credits"),
          authorizedRequest<CostsResponse>("/billing/costs"),
          authorizedRequest<TransactionsResponse>("/billing/transactions?limit=100"),
        ]);
        if (cancelled) return;
        setBalance(creditsRes.credits ?? 0);
        setCosts(costsRes.costs ?? {});
        setTransactions(txRes.transactions ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        if (!cancelled) {
          setError("We couldn't load credit data.");
        }
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

  const debitsThisWeek = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return transactions
      .filter((tx) => tx.type === "debit" && tx.createdAt && Date.parse(tx.createdAt) >= weekAgo)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions]);

  const creditsAdded = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === "credit")
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions]);

  const sortedCosts = useMemo(() => {
    return Object.entries(costs)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        key,
        value,
        label: OPERATION_LABELS[key] ?? key,
        description: OPERATION_DESCRIPTIONS[key],
      }));
  }, [costs]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">Available credits</p>
          <div className="flex items-baseline gap-3">
            <p className="text-4xl font-semibold text-white">
              {balance !== null ? balance.toLocaleString() : "–"}
            </p>
            <span className="text-sm text-zinc-400">credits</span>
          </div>
          <p className="text-sm text-zinc-400 mt-2">
            Credits are consumed whenever your workflows execute NilAI, NilDB, Zcash, or connector blocks.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center gap-3">
            <Coins className="h-10 w-10 text-amber-300" />
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">Added credits</p>
              <p className="text-lg font-semibold text-white">{creditsAdded.toLocaleString()} credits</p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="justify-center"
            onClick={() => alert("Contact support to top up credits.")}
          >
            Add credits
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Per-operation costs</h3>
              <p className="text-xs text-zinc-400 mt-1">How each workflow action consumes credits.</p>
            </div>
            <span className="text-[11px] text-zinc-500">Powered by billing service</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div key={idx} className="h-12 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : sortedCosts.length === 0 ? (
            <p className="text-sm text-zinc-500">No cost schedule found.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {sortedCosts.map((item) => (
                <li key={item.key} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-white font-medium">{item.label}</p>
                    {item.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-100">{item.value} credits</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ArrowDownRight className="h-10 w-10 text-rose-400" />
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">Debits last 7 days</p>
              <p className="text-2xl font-semibold text-white">{debitsThisWeek.toLocaleString()} credits</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400 mb-1 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" /> Recent activity
            </p>
            {transactions.length === 0 ? (
              <p className="text-sm text-zinc-500">No transactions yet.</p>
            ) : (
              <div>
                <p className="text-sm text-white font-medium">{formatOperation(transactions[0].operation)}</p>
                <p className="text-xs text-zinc-500">{formatDate(transactions[0].createdAt)}</p>
                <p
                  className={`text-sm font-semibold mt-2 ${
                    transactions[0].type === "debit" ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {transactions[0].type === "debit" ? "-" : "+"}
                  {transactions[0].amount.toLocaleString()} credits
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Transaction history</h3>
            <p className="text-xs text-zinc-400 mt-1">Chronological ledger for your organization.</p>
          </div>
          <History className="h-5 w-5 text-zinc-500" />
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-zinc-500">No transactions to display.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {transactions.map((tx) => (
              <li key={tx._id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-white">{formatOperation(tx.operation)}</p>
                  <p className="text-xs text-zinc-500">
                    {tx.reason ? `${tx.reason} • ` : ""}
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      tx.type === "debit" ? "text-rose-300" : "text-emerald-300"
                    }`}
                  >
                    {tx.type === "debit" ? "-" : "+"}
                    {tx.amount.toLocaleString()} credits
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Balance {tx.balanceAfter?.toLocaleString() ?? "–"} credits
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
