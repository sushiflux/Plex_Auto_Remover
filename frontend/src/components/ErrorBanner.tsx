import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, X } from 'lucide-react';

interface ErrorBannerProps {
  headline: string;
  details: string;
  copyLabel: string;
  copiedLabel: string;
  detailsLabel: string;
  onDismiss: () => void;
}

export function ErrorBanner({
  headline,
  details,
  copyLabel,
  copiedLabel,
  detailsLabel,
  onDismiss,
}: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${headline}\n\n${details}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="alert"
      className="rounded-[10px] border border-[var(--c-danger)] bg-[var(--c-danger-soft)] p-4 text-sm text-[var(--c-text)] space-y-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-[var(--c-danger)] cursor-pointer shrink-0"
            aria-label={detailsLabel}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className="font-medium break-words select-text">{headline}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface)] text-xs font-medium cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--c-success)]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? copiedLabel : copyLabel}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="p-3 rounded-[6px] bg-[var(--c-surface)] border border-[var(--c-border)] text-xs font-mono whitespace-pre-wrap break-words select-all">
          {details}
        </pre>
      )}
    </div>
  );
}
