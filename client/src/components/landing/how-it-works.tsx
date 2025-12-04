import { motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Code2,
  Database,
  GitBranch,
  Lock,
  Twitter,
  Wallet,
  Webhook,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const triggers = [
  { id: 1, name: "Webhook", icon: Webhook },
  { id: 2, name: "Zcash Tx", icon: Wallet },
  { id: 3, name: "Schedule", icon: Calendar },
  { id: 4, name: "Twitter", icon: Twitter },
  { id: 5, name: "GitHub", icon: GitBranch },
  { id: 6, name: "HTTP Poll", icon: Zap },
];

const steps = [
  {
    id: 1,
    name: "Trigger",
    description: "Event initiates the workflow",
    icon: Zap,
  },
  {
    id: 2,
    name: "Validate",
    description: "Verify schema & authenticate",
    icon: CheckCircle2,
  },
  {
    id: 3,
    name: "Compute",
    description: "Private processing on Nillion",
    icon: Lock,
  },
  {
    id: 4,
    name: "Execute",
    description: "Run workflow logic",
    icon: Code2,
  },
  {
    id: 5,
    name: "Settle",
    description: "Transfer on Zcash",
    icon: Database,
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [activeTrigger, setActiveTrigger] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= steps.length - 1) {
          // Reset and change trigger
          setActiveTrigger((t) => (t + 1) % triggers.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  return (
    <section id="how-it-works" className="relative py-16 sm:py-20 overflow-hidden">
      {/* Section Divider - Top */}
      <div className="absolute top-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/30 to-transparent" />
      </div>

      {/* Section Divider - Bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6758c1]/30 to-transparent" />
      </div>
      
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-base font-semibold text-[#6758c1] mb-2">
            How It Works
          </h2>
          <p className="text-3xl font-bold text-white sm:text-4xl">
            From trigger to settlement
          </p>
          <p className="mt-3 text-lg text-zinc-400 max-w-2xl mx-auto">
            Every workflow follows a secure, predictable path through our execution pipeline
          </p>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="grid gap-8 items-stretch lg:grid-cols-[260px_1fr]">
          
          {/* Left Column - Triggers */}
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Available Triggers
            </h3>
            <div className="space-y-1.5">
              {triggers.map((trigger, index) => (
                <motion.div
                  key={trigger.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
                    activeTrigger === index
                      ? "bg-[#6758c1]/20 border border-[#6758c1]"
                      : "bg-zinc-800/50 border border-transparent hover:bg-zinc-800"
                  }`}
                  onClick={() => {
                    setActiveTrigger(index);
                    setActiveStep(0);
                  }}
                  whileHover={{ x: 3 }}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                      activeTrigger === index
                        ? "bg-[#6758c1] text-white"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    <trigger.icon className="h-4 w-4" />
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      activeTrigger === index ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {trigger.name}
                  </span>
                  {activeTrigger === index && (
                    <motion.div
                      className="ml-auto"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-[#6758c1] animate-pulse" />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right Column - Pipeline */}
          <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Execution Pipeline
            </h3>
            
            {/* Horizontal Stepper */}
            <div className="relative py-2 overflow-x-auto">
              {/* Steps */}
              <div className="relative flex justify-between min-w-[520px] pr-4">
                {steps.map((step, index) => {
                  const isActive = activeStep === index;
                  const isCompleted = activeStep > index;

                  return (
                    <div
                      key={step.id}
                      className="flex flex-col items-center text-center relative"
                      style={{ width: `${100 / steps.length}%` }}
                    >
                      {/* Connector Line to Next Step */}
                      {index < steps.length - 1 && (
                        <div className="absolute top-5 left-[calc(50%+22px)] right-[calc(-50%+22px)] h-0.5">
                          {/* Background line */}
                          <div className="absolute inset-0 bg-zinc-700" />
                          {/* Progress line */}
                          <motion.div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-green-400"
                            initial={{ width: "0%" }}
                            animate={{
                              width: isCompleted ? "100%" : "0%",
                            }}
                            transition={{ duration: 0.4 }}
                          />
                        </div>
                      )}

                      {/* Step Circle */}
                      <motion.div
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all duration-300 ${
                          isActive
                            ? "bg-[#6758c1] border-[#6758c1] shadow-lg shadow-[#6758c1]/50"
                            : isCompleted
                            ? "bg-green-500/20 border-green-500"
                            : "bg-zinc-800 border-zinc-700"
                        }`}
                        animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <step.icon
                            className={`h-5 w-5 ${
                              isActive ? "text-white" : "text-zinc-500"
                            }`}
                          />
                        )}
                      </motion.div>

                      {/* Step Label */}
                      <div className="mt-2">
                        <p
                          className={`font-semibold text-xs ${
                            isActive
                              ? "text-white"
                              : isCompleted
                              ? "text-green-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {step.name}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 max-w-[70px] mx-auto leading-tight ${
                            isActive || isCompleted
                              ? "text-zinc-400"
                              : "text-zinc-600"
                          }`}
                        >
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current Step Detail Card */}
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-zinc-800/50 rounded-lg border border-zinc-700 p-4"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
                    activeStep === steps.length - 1
                      ? "bg-green-500"
                      : "bg-[#6758c1]"
                  }`}
                >
                  {(() => {
                    const StepIcon = steps[activeStep].icon;
                    return <StepIcon className="h-5 w-5 text-white" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-500">
                      Step {activeStep + 1}/{steps.length}
                    </span>
                    {activeStep === 0 && (
                      <span className="text-xs font-medium text-[#6758c1]">
                        • {triggers[activeTrigger].name}
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white mb-1">
                    {steps[activeStep].name}
                  </h4>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {activeStep === 0 &&
                      `Your workflow is triggered by a ${triggers[activeTrigger].name.toLowerCase()} event. The system captures the incoming data and prepares it for processing.`}
                    {activeStep === 1 &&
                      "The incoming payload is validated using our schemas and your trigger and block configuration. Authentication and authorization checks ensure only legitimate requests proceed."}
                    {activeStep === 2 &&
                      "Sensitive data is processed using Nillion's blind computation. Your data remains encrypted and private throughout the entire computation."}
                    {activeStep === 3 &&
                      "Your custom workflow logic executes with the validated and computed data. Transformations, API calls, and business logic run securely."}
                    {activeStep === 4 &&
                      "Final transactions are settled on Zcash with full privacy. Shielded transfers ensure your financial data remains confidential."}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 text-center">
          <p className="text-zinc-400">
            Ready to build your first workflow?{" "}
            <Link to="/auth" className="text-[#6758c1] hover:text-[#5344ad] font-semibold transition-colors">
              Get started →
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
