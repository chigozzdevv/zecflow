import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "What is ZecFlow?",
    answer:
      "ZecFlow is an automation layer for Zcash that lets you orchestrate private workflows across on-chain actions, Nillion compute, and web2 services.",
  },
  {
    question: "Do I need to write smart contracts?",
    answer:
      "Most flows can be built in the visual builder using triggers, checks, and prebuilt blocks. You can still drop down to code for custom logic when needed.",
  },
  {
    question: "How does privacy work in practice?",
    answer:
      "Value moves through Zcash shielded addresses while sensitive inputs are processed with blind computation on Nillion, so raw data and balances are never exposed in plaintext.",
  },
  {
    question: "What can trigger a workflow?",
    answer:
      "On-chain events, webhooks from your app, scheduled timers, or external services like GitHub and Twitter can all act as triggers.",
  },
  {
    question: "Is ZecFlow open to teams today?",
    answer:
      "Yes, we are onboarding design partners. You can start with sandbox workflows and move to production as you harden your policies.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 sm:py-32 border-t border-zinc-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-base md:text-lg text-zinc-400">
            Answers to the most common questions about how ZecFlow works.
          </p>
        </motion.div>

        <div className="mx-auto mt-12 max-w-3xl space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.4, delay: index * 0.03 }}
            >
              <FAQItem
                question={faq.question}
                answer={faq.answer}
                isOpen={openIndex === index}
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({
  question,
  answer,
  isOpen,
  onClick,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-white">{question}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-zinc-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-0 text-sm leading-6 text-zinc-400">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
