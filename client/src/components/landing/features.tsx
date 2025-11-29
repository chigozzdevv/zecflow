import { Activity, Lock, Network, ShieldCheck, Workflow, Zap } from "lucide-react";

const features = [
  {
    name: "Shielded Zcash transfers",
    description: "Send shielded ZEC as part of a workflow using our Zcash transfer blocks.",
    icon: Lock,
  },
  {
    name: "Private Nillion compute",
    description: "Use Nillion compute and storage blocks to process and persist sensitive data privately.",
    icon: ShieldCheck,
  },
  {
    name: "Event-driven triggers",
    description: "Kick off workflows from webhooks, Zcash transactions, schedules, Twitter, GitHub, or HTTP polls.",
    icon: Zap,
  },
  {
    name: "Encrypted state storage",
    description: "Store and read encrypted workflow state using Nillion-backed storage collections.",
    icon: Network,
  },
  {
    name: "HTTP and connector actions",
    description: "Call GitHub, custom HTTP APIs, and other services directly from your workflows.",
    icon: Workflow,
  },
  {
    name: "Run history APIs",
    description: "Inspect workflow runs and outputs via APIs so you can build your own monitoring views.",
    icon: Activity,
  },
];

export function Features() {
  return (
    <div id="features" className="bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6758c1]">Core capabilities</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Private automation on Zcash and Nillion
          </p>
          <p className="mt-6 text-lg leading-8 text-zinc-400">
            ZecFlow blends shielded Zcash transfers, Nillion compute, and event-driven triggers so you can
            orchestrate private workflows end to end.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 hover:border-[#6758c1]/50 transition-colors">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
                  <feature.icon className="h-5 w-5 flex-none text-[#6758c1]" aria-hidden="true" />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-zinc-400">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}