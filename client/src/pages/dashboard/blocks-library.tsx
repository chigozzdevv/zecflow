import { useEffect, useMemo, useState } from "react";
import { authorizedRequest, ApiError } from "@/lib/api-client";
import { Cpu, Database, Shuffle, Terminal, Zap } from "lucide-react";

type BlockCategory = "input" | "compute" | "action" | "storage" | "transform";

type BlockDefinition = {
  id: string;
  name: string;
  description: string;
  category: BlockCategory;
  handler: "logic" | "nillion" | "nilai" | "zcash" | "connector";
};

type NillionBlockDefinition = {
  id: string;
  name: string;
  description: string;
  category: BlockCategory;
  handler: "nillion";
};

type BlockDefinitionsResponse = {
  blocks: BlockDefinition[];
  nillionBlocks: NillionBlockDefinition[];
};

export function DashboardBlocksLibraryPage() {
  const [coreBlocks, setCoreBlocks] = useState<BlockDefinition[]>([]);
  const [nillionBlocks, setNillionBlocks] = useState<NillionBlockDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await authorizedRequest<BlockDefinitionsResponse>("/blocks/definitions");
        if (cancelled) return;
        setCoreBlocks(res.blocks ?? []);
        setNillionBlocks(res.nillionBlocks ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load blocks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasBlocks = coreBlocks.length > 0 || nillionBlocks.length > 0;

  const categoryOrder: BlockCategory[] = ["input", "compute", "action", "storage", "transform"];

  const categoryMeta = {
    input: {
      label: "Inputs",
      description: "Blocks that pull data into a workflow.",
      icon: Terminal,
      color: "text-sky-300 bg-sky-500/10 border-sky-500/30",
    },
    compute: {
      label: "Compute",
      description: "Blocks that run logic, NilAI or Nillion compute.",
      icon: Cpu,
      color: "text-violet-300 bg-violet-500/10 border-violet-500/30",
    },
    action: {
      label: "Actions",
      description: "Blocks that call external systems or send Zcash.",
      icon: Zap,
      color: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    },
    storage: {
      label: "Storage",
      description: "Blocks that read and write state.",
      icon: Database,
      color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    },
    transform: {
      label: "Transforms",
      description: "Blocks that reshape or parse data.",
      icon: Shuffle,
      color: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30",
    },
  } as const;

  const allBlocks = useMemo(
    () => [
      ...coreBlocks.map((b) => ({ ...b, source: "core" as const })),
      ...nillionBlocks.map((b) => ({ ...b, source: "nillion" as const })),
    ],
    [coreBlocks, nillionBlocks],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Blocks</h2>
          <p className="text-sm text-zinc-300 max-w-xl">
            The internal blocks you can use inside workflows.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        </div>
      ) : !hasBlocks ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">No blocks registered yet.</p>
          <p className="text-xs text-zinc-500">Blocks from the backend registry will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categoryOrder.map((category) => {
            const meta = categoryMeta[category];
            const items = allBlocks
              .filter((b) => b.category === category)
              .sort((a, b) => a.name.localeCompare(b.name));

            if (items.length === 0) return null;

            const Icon = meta.icon;

            return (
              <section
                key={category}
                className="rounded-3xl border border-white/10 bg-zinc-900/80 p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs ${meta.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{meta.label}</h3>
                      <p className="text-xs text-zinc-400">{meta.description}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((block) => {
                    const handler = block.handler;
                    let handlerLabel: string = handler;
                    let handlerClasses = "bg-zinc-800 text-zinc-200 border-zinc-600";

                    if (handler === "logic") {
                      handlerLabel = "Logic";
                      handlerClasses = "bg-sky-500/10 text-sky-200 border-sky-500/40";
                    } else if (handler === "nillion") {
                      handlerLabel = "Nillion";
                      handlerClasses = "bg-violet-500/10 text-violet-200 border-violet-500/40";
                    } else if (handler === "nilai") {
                      handlerLabel = "NilAI";
                      handlerClasses = "bg-emerald-500/10 text-emerald-200 border-emerald-500/40";
                    } else if (handler === "zcash") {
                      handlerLabel = "Zcash";
                      handlerClasses = "bg-amber-500/10 text-amber-200 border-amber-500/40";
                    } else if (handler === "connector") {
                      handlerLabel = "Connector";
                      handlerClasses = "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/40";
                    }

                    return (
                      <div
                        key={block.id}
                        className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3 flex flex-col gap-1 hover:border-white/30 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-white">{block.name}</div>
                            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                              {block.category}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${handlerClasses}`}
                          >
                            {handlerLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug line-clamp-3">
                          {block.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
