const STACK_LAYERS = [
  {
    title: "Zcash",
    subtitle: "Shielded settlement",
    summary:
      "Shielded transfers and memo parsing keep value movement private while still feeding workflows with structured data.",
    blocks: ["payload-input", "json-extract", "memo-parser", "zcash-send"],
    details: [
      "Ingest memos + payloads straight from shielded txs",
      "Emit compliant payouts without revealing recipients",
    ],
  },
  {
    title: "NilDB",
    subtitle: "Blind state",
    summary:
      "Encrypted state collections back every decision so operators orchestrate logic without ever touching raw inputs.",
    blocks: ["state-store", "state-read"],
    details: [
      "Store income, KYC, approvals with full-field encryption",
      "Read prior runs via state keys + delegation tokens",
    ],
  },
  {
    title: "NilAI",
    subtitle: "Private reasoning",
    summary:
      "NilAI crafts explanations from NilDB aliases, producing narratives that never leak the underlying facts.",
    blocks: ["nilai-llm"],
    details: [
      "Reference encrypted aliases directly inside prompts",
      "Return shielded justifications for auditors or end-users",
    ],
  },
  {
    title: "NilCC",
    subtitle: "Blind compute",
    summary:
      "Policy math, branching, and NilCC workloads evaluate encrypted inputs and hand results to downstream blocks.",
    blocks: ["nillion-compute", "nillion-block-graph", "math-*", "logic-if-else"],
    details: [
      "Compose risk graphs without decrypting income/debt",
      "Feed attestations into NilAI + Zcash outputs",
    ],
  },
];

export function ComputeStack() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden border-t border-zinc-900">
      <div className="absolute top-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/30 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/30 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[#b2a8ff]">Complete blind compute stack</p>
          <h2 className="text-3xl font-semibold text-white">From shielded value to private reasoning</h2>
          <p className="text-sm text-zinc-400 max-w-3xl mx-auto">
            Mix Zcash, NilDB, NilAI, and NilCC blocks in any order to assemble truly private automation pipelines.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {STACK_LAYERS.map((layer) => (
            <article
              key={layer.title}
              className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 transition-colors duration-200 hover:border-[#6758c1]/60"
            >
              <div className="flex items-center justify-between mb-2 text-xs uppercase tracking-wide text-zinc-500">
                <span>{layer.subtitle}</span>
                <span className="text-[#b2a8ff] font-semibold">{layer.title}</span>
              </div>
              <p className="text-sm text-zinc-200 mb-3">{layer.summary}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {layer.blocks.map((block) => (
                  <span
                    key={block}
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300"
                  >
                    {block}
                  </span>
                ))}
              </div>
              <ul className="space-y-1 text-xs text-zinc-400">
                {layer.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#6758c1]" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
