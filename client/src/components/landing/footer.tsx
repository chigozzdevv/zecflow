import { Github, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-900 py-6" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
          <img
            src="/zecflow-logo.png"
            alt="ZecFlow"
            className="h-14 w-auto object-contain"
          />
          <p className="text-xs leading-5 text-zinc-500 text-center md:text-left">
            &copy; {new Date().getFullYear()} ZecFlow. All rights reserved.
          </p>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <a href="#" className="hover:text-white">
            <span className="sr-only">Twitter</span>
            <Twitter className="h-5 w-5" aria-hidden="true" />
          </a>
          <a href="#" className="hover:text-white">
            <span className="sr-only">GitHub</span>
            <Github className="h-5 w-5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}