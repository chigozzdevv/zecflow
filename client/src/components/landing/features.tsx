import { Activity, Lock, Network, ShieldCheck, Workflow, Zap } from "lucide-react";

const features = [
  {
    name: "Visual Workflow Builder",
    description: "Drag and drop blocks to create complex automation flows. No coding required for basic logic.",
    icon: Workflow,
  },
  {
    name: "Private Transactions",
    description: "Native integration with Zcash for shielded transactions. Keep your financial data private.",
    icon: Lock,
  },
  {
    name: "Secure Computation",
    description: "Leverage Nillion's blind computation to process sensitive data without exposing it.",
    icon: ShieldCheck,
  },
  {
    name: "Event-Driven Triggers",
    description: "Trigger workflows from on-chain events, webhooks, or scheduled timers.",
    icon: Zap,
  },
  {
    name: "Multi-Chain Support",
    description: "Connect to multiple blockchains and orchestrate cross-chain operations seamlessly.",
    icon: Network,
  },
  {
    name: "Real-time Monitoring",
    description: "Track workflow execution in real-time with detailed logs and analytics.",
    icon: Activity,
  },
];

export function Features() {
  return (
    <div id="features" className="bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6758c1]">Powerful Capabilities</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything you need to build private dApps
          </p>
          <p className="mt-6 text-lg leading-8 text-zinc-400">
            ZecFlow combines the best of privacy technology with ease of use.
            Build robust applications without compromising on security or user privacy.
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