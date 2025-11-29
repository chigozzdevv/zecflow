import { motion } from "framer-motion";
import { CheckCircle2, FileCheck, Shield, ShieldCheck } from "lucide-react";

const points = [
  {
    title: "Shielded value flows",
    description:
      "Use Zcash shielded addresses so workflow funding, payouts, and internal transfers are not publicly linkable.",
    icon: ShieldCheck,
  },
  {
    title: "Minimized data surface",
    description:
      "Keep sensitive inputs encrypted in Nillion and avoid copying raw user data across services.",
    icon: Shield,
  },
  {
    title: "Policy-aware execution",
    description:
      "Enforce limits, approvals, and audit flags inside the workflow graph instead of in ad-hoc scripts.",
    icon: FileCheck,
  },
  {
    title: "Operational transparency",
    description:
      "Track who triggered what, when, and with which parameters for later review.",
    icon: CheckCircle2,
  },
];

export function Compliance() {
  return (
    <section id="compliance" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/50 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/50 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6758c1]">Compliance</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Designed for sensitive automation flows
          </p>
          <p className="mt-4 text-lg leading-8 text-zinc-400">
            Run private value flows and user data locked down while still letting agents and services coordinate
            complex tasks.
          </p>
        </div>

        <div className="mt-16 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative order-2 lg:order-1 flex items-center"
          >
            <div className="relative w-full rounded-3xl border border-zinc-800 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl p-6 md:p-14 lg:p-16 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#6758c1]/10 via-transparent to-emerald-500/10" />

              <div className="relative">
                <img src="/world.svg" alt="Global infrastructure map" className="w-full h-auto opacity-70" />

                <span className="absolute top-[28%] left-[18%] flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6758c1] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#6758c1]" />
                </span>
                <span className="absolute top-[32%] right-[28%] flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" style={{ animationDelay: "0.7s" }} />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <span className="absolute bottom-[38%] left-[46%] flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" style={{ animationDelay: "1.4s" }} />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
                </span>
                <span className="absolute bottom-[28%] right-[15%] flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" style={{ animationDelay: "2.1s" }} />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="order-1 lg:order-2"
          >
            <dl className="space-y-6">
              {points.map((point, index) => (
                <motion.div
                  key={point.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
                  className="flex gap-3"
                >
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e]/15 text-[#22c55e]">
                    <point.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-white">{point.title}</dt>
                    <dd className="mt-1 text-sm leading-6 text-zinc-400">{point.description}</dd>
                  </div>
                </motion.div>
              ))}
            </dl>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
