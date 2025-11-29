import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <img
            src="/zecflow-logo.png"
            alt="ZecFlow"
            className="h-20 w-auto object-contain"
          />

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="flex items-center gap-8">
              <a
                href="#run-a-demo"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Run a Demo
              </a>
              <a href="#why-zecflow" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Why ZecFlow
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                How it Works
              </a>
              <a href="#blocks" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Blocks
              </a>
              <a href="#compliance" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Compliance
              </a>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:block">
            <div className="flex items-center gap-4">
              <Button
                asChild
                variant="ghost"
                className="text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild className="bg-[#6758c1] text-white hover:bg-[#5344ad] border-none">
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus:outline-none"
            >
              {isMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-zinc-900 border-b border-zinc-800">
          <div className="space-y-1 px-2 pb-3 pt-2 sm:px-3">
            <a
              href="#run-a-demo"
              className="block rounded-md px-3 py-2 text-base font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Run a Demo
            </a>
            <a
              href="#why-zecflow"
              className="block rounded-md px-3 py-2 text-base font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Why ZecFlow
            </a>
            <a
              href="#how-it-works"
              className="block rounded-md px-3 py-2 text-base font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              How it Works
            </a>
            <a
              href="#blocks"
              className="block rounded-md px-3 py-2 text-base font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Blocks
            </a>
            <a
              href="#compliance"
              className="block rounded-md px-3 py-2 text-base font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Compliance
            </a>
          </div>
          <div className="border-t border-zinc-800 pb-3 pt-4">
            <div className="flex items-center px-5 gap-4">
              <Button
                asChild
                variant="ghost"
                className="w-full justify-center text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button
                asChild
                className="w-full justify-center bg-[#6758c1] text-white hover:bg-[#5344ad] border-none"
              >
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}