import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { X, Copy, Check } from "lucide-react";

type CodeSnippetModalProps = {
  code: string;
  language?: string;
  title?: string;
  onClose: () => void;
};

export function CodeSnippetModal({
  code,
  language = "tsx",
  title = "Integration Snippet",
  onClose,
}: CodeSnippetModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] mx-4 rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy code
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className="text-[12px] leading-relaxed rounded-lg p-4 overflow-x-auto"
                style={{ ...style, background: "rgba(0,0,0,0.4)" }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="inline-block w-8 text-zinc-600 select-none text-right mr-4">
                      {i + 1}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
        <div className="px-5 py-3 border-t border-white/10 text-[11px] text-zinc-500">
          Copy this code into your React application to integrate with your workflow.
        </div>
      </div>
    </div>
  );
}
