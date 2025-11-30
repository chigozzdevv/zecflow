import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import BackgroundGrid from "./background-grid";

export function Hero() {
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="relative overflow-hidden bg-black min-h-screen flex items-center"
      onMouseMove={(e) => {
        const t = e.currentTarget.getBoundingClientRect();
        setMouse({ x: e.clientX - t.left, y: e.clientY - t.top });
      }}
      onMouseLeave={() => setMouse(null)}
    >
      <BackgroundGrid mouse={mouse} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pointer-events-none w-full py-20">
        <div className="text-center max-w-4xl mx-auto pointer-events-auto">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl mb-6">
            Private Agentic<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[#6758c1]">
              Web3 Workflows
            </span>
          </h1>

          <p className="text-lg text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Build, deploy, and manage decentralized automation workflows.
            Leverage Zcash for private transfers and Nillion NilCC blocks for secure computation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto bg-[#6758c1] hover:bg-[#5344ad] text-white h-12 px-8 text-base">
              Start Building
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 h-12 px-8 text-base"
            >
              <Link to="/demo">
                <Play className="mr-2 h-4 w-4" />
                Run a Demo
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
