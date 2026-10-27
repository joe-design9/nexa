'use client';
import { useStore } from '../lib/store';

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(340px,90vw)]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`text-left rounded-xl border px-4 py-3 shadow-xl animate-pop-in backdrop-blur bg-nexa-panel2/95 ${
            t.kind === 'error' ? 'border-nexa-danger/60' : t.kind === 'success' ? 'border-nexa-success/60' : t.kind === 'mention' ? 'border-nexa-violet/70' : 'border-nexa-border'
          }`}
        >
          <div className="font-semibold text-sm text-nexa-text">{t.title}</div>
          {t.body && <div className="text-xs text-nexa-muted mt-0.5 line-clamp-2">{t.body}</div>}
        </button>
      ))}
    </div>
  );
}
