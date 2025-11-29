import { Play } from "lucide-react";

export function VideoDemo() {
  return (
    <section id="run-a-demo" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">See ZecFlow in Action</h2>
          <p className="mt-4 text-lg text-zinc-400">
            Watch how easy it is to build private, agentic workflows on Web3.
          </p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          {/* Glow effect behind video */}
          <div className="absolute -inset-1 bg-gradient-to-r from-[#6758c1] to-[#5344ad] rounded-2xl blur opacity-30" />

          <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 aspect-video overflow-hidden shadow-2xl">
            {/* Placeholder for video - replacing with actual video embed later */}
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 group cursor-pointer hover:bg-zinc-900/40 transition-colors">
              <div className="h-20 w-20 rounded-full bg-[#6758c1] flex items-center justify-center pl-1 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Play className="h-8 w-8 text-white fill-white" />
              </div>
            </div>

            {/* Optional: Placeholder image if no video is playing */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-zinc-800 to-zinc-900" />
          </div>
        </div>
      </div>
    </section>
  );
}
