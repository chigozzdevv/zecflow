import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";
import { Blocks } from "@/components/landing/blocks";
import { Compliance } from "@/components/landing/compliance";
import { FAQ } from "@/components/landing/faq";
import { WhyZecFlow } from "@/components/landing/why-zecflow";
import { VideoDemo } from "@/components/landing/video-demo";
import { ComputeStack } from "@/components/landing/compute-stack";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white selection:bg-purple-500/30">
      <Navbar />
      <main>
        <Hero />
        <VideoDemo />
        <ComputeStack />
        <WhyZecFlow />
        <HowItWorks />
        <Blocks />
        <Compliance />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
