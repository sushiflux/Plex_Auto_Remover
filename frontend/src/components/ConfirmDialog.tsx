import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = (options: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => {
      setPending({ ...options, resolve });
    });

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const dialog: ReactNode = pending ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => {
        pending.resolve(false);
        setPending(null);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="w-full max-w-md rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-[var(--c-text)]">
          {pending.title}
        </h2>
        <p id="confirm-desc" className="text-sm leading-relaxed text-[var(--c-text-muted)] whitespace-pre-wrap">
          {pending.message}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              pending.resolve(false);
              setPending(null);
            }}
            className="px-4 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface)] text-sm font-medium text-[var(--c-text)] hover:bg-[var(--c-surface-alt)] cursor-pointer"
          >
            {pending.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              pending.resolve(true);
              setPending(null);
            }}
            className={`px-4 py-2 rounded-[6px] text-sm font-medium text-white cursor-pointer ${
              pending.destructive ? 'bg-[var(--c-danger)]' : 'bg-[var(--c-accent)]'
            }`}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
