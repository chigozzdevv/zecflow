import { motion } from "framer-motion";
import { Brain, Database, GitBranch, Lock, Wallet, Zap } from "lucide-react";

const blocks = [
  {
    id: "shielded-transfer",
    name: "Shielded transfer",
    description: "Send ZEC privately from any workflow step.",
    icon: Wallet,
    color: "#22c55e",
  },
  {
    id: "nilcc-compute",
    name: "NilCC compute",
    description: "Run blind computation on encrypted inputs.",
    icon: Lock,
    color: "#6366f1",
  },
  {
    id: "conditional-logic",
    name: "Conditional logic",
    description: "Branch on balances, approvals, or compute outputs.",
    icon: GitBranch,
    color: "#f97316",
  },
  {
    id: "webhook",
    name: "Webhook trigger",
    description: "Start flows from your existing apps and APIs.",
    icon: Zap,
    color: "#22d3ee",
  },
  {
    id: "nildb-state",
    name: "NilDB state",
    description: "Encrypt with `state-store` and pull back via `state-read` using state keys.",
    icon: Database,
    color: "#a855f7",
  },
  {
    id: "nilai-reasoning",
    name: "NilAI reasoning",
    description: "Generate blind explanations with the `nilai-llm` block.",
    icon: Brain,
    color: "#facc15",
  },
];

export function Blocks() {
  return (
    <section id="blocks" className="py-24 sm:py-32 border-t border-zinc-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6758c1]">Composable blocks</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Build workflows from reusable primitives
          </p>
          <p className="mt-4 text-lg leading-8 text-zinc-400">
            Mix on-chain actions, off-chain compute, and web triggers. Each block is small, typed, and designed
            to compose.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block, index) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: index * 0.04 }}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm shadow-black/40 overflow-hidden transition-colors transition-transform duration-200 hover:border-[#6758c1]/60 hover:bg-zinc-900 hover:-translate-y-1"
            >
              <div className="relative flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${block.color}20` }}
                >
                  <block.icon className="h-5 w-5" style={{ color: block.color }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{block.name}</h3>
                  <p className="mt-1 text-xs text-zinc-400">{block.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
