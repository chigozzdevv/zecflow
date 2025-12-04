import { Lock, ShieldCheck, Workflow, Zap } from "lucide-react";

const reasons = [
  {
    title: "Low-code workflows",
    description:
      "Most flows come from configuring blocks and paths instead of shipping new backend scripts for every change.",
    icon: Workflow,
  },
  {
    title: "Zcash + Nillion + HTTP together",
    description:
      "Combine shielded Zcash sends, Nillion compute, and HTTP actions in one workflow instead of glue code.",
    icon: Zap,
  },
  {
    title: "Built-in triggers",
    description:
      "Webhooks, Zcash transactions, schedules, social events, and HTTP polls come as first-class trigger types.",
    icon: Lock,
  },
  {
    title: "Runs you can inspect",
    description:
      "Every execution is stored as a run you can list by workflow and inspect when debugging or auditing.",
    icon: ShieldCheck,
  },
];

export function WhyZecFlow() {
  return (
    <section id="why-zecflow" className="py-24 sm:py-32 border-t border-zinc-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6758c1]">Why ZecFlow</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Visual, block-based private workflows
          </p>
          <p className="mt-4 text-lg leading-8 text-zinc-400">
            ZecFlow gives you a visual builder for connecting triggers, Nillion blind compute, and Zcash transfers.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-5xl grid gap-8 sm:grid-cols-2">
          {reasons.map((reason) => (
            <div
              key={reason.title}
              className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm shadow-black/40 transition-colors transition-transform duration-200 hover:border-[#6758c1]/60 hover:bg-zinc-900 hover:-translate-y-1"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6758c1]/15 text-[#6758c1] mb-3">
                <reason.icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">{reason.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{reason.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
