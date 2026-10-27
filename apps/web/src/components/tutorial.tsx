'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { patch } from '../lib/api';
import { useStore } from '../lib/store';
import { useLocale } from '../lib/locale';
import type { PublicUser } from '../lib/types';

/**
 * Onboarding-Tour für neue Konten.
 *
 * Ablauf: Die Tour öffnet sich automatisch, sobald ein eingeloggtes Konto
 * geladen ist, dessen Profil-Flag `tutorialSeenAt` noch NULL ist (das sind
 * nur Konten, die nach Einführung des Features registriert wurden –
 * Bestands- und Seed-Konten wurden per Migration bzw. Seed als „gesehen"
 * markiert). Beenden oder Überspringen setzt das Flag per PATCH /users/me
 * (`tutorialSeen: true`); danach startet die Tour nie wieder automatisch.
 * Manuell lässt sie sich über die Konto-Einstellungen erneut starten
 * (Store-Flag `tutorialOpen`).
 *
 * Darstellung: Abdunklung + Spotlight-Rahmen um das erklärte UI-Element
 * (per `data-tour`-Attribut in der Shell/ im Chat gefunden). Fehlt das
 * Element in der aktuellen Ansicht (z. B. Favoriten-Stern ohne Server oder
 * Nachrichtenfeld in der Freundesansicht), erscheint die Karte zentriert.
 */

interface TourStepDef {
  icon: string;
  /** Wert des `data-tour`-Attributs des zu markierenden Elements. */
  target?: string;
}

const STEP_DEFS: TourStepDef[] = [
  { icon: '👋' },
  { icon: '🏠', target: 'server-bar' },
  { icon: '⭐', target: 'fav-star' },
  { icon: '💬', target: 'sidebar' },
  { icon: '✍️', target: 'message-input' },
  { icon: '👥', target: 'dm-button' },
  { icon: '🎙️' },
  { icon: '🧭', target: 'discover' },
  { icon: '🏅', target: 'user-panel' },
  { icon: '⚙️', target: 'settings' },
];

const CARD_W = 360;
const CARD_H_EST = 320;

function measure(target?: string): DOMRect | null {
  if (!target || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  // Element muss (weitgehend) im sichtbaren Bereich liegen.
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return null;
  return r;
}

function cardPosition(rect: DOMRect | null): React.CSSProperties {
  if (!rect) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const M = 10;
  const GAP = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (top: number) => Math.min(Math.max(M, top), Math.max(M, vh - CARD_H_EST - M));
  const clampLeft = (left: number) => Math.min(Math.max(M, left), Math.max(M, vw - CARD_W - M));
  // Bevorzugt rechts neben dem Element (Serverleiste/Sidebar sind links).
  if (rect.right + GAP + CARD_W <= vw - M) return { left: rect.right + GAP, top: clampTop(rect.top) };
  if (rect.left - GAP - CARD_W >= M) return { left: rect.left - GAP - CARD_W, top: clampTop(rect.top) };
  if (rect.bottom + GAP + CARD_H_EST <= vh - M) return { left: clampLeft(rect.left), top: rect.bottom + GAP };
  if (rect.top - GAP - CARD_H_EST >= M) return { left: clampLeft(rect.left), top: rect.top - GAP - CARD_H_EST };
  return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
}

export function OnboardingTour() {
  const { t, fmt } = useLocale();
  const open = useStore((s) => s.tutorialOpen);
  const setOpen = useStore((s) => s.setTutorialOpen);
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const autoOpenedFor = useRef<string | null>(null);

  const total = Math.min(STEP_DEFS.length, t.tutorial.steps.length);
  const def = STEP_DEFS[step];
  const text = t.tutorial.steps[step];

  // Auto-Start: nur für Konten ohne gesehen-Flag, einmal pro Konto/Sitzung.
  useEffect(() => {
    if (!user || user.tutorialSeenAt) return;
    if (autoOpenedFor.current === user.id) return;
    autoOpenedFor.current = user.id;
    setStep(0);
    setOpen(true);
  }, [user, setOpen]);

  // Bei jedem Öffnen wieder von vorn beginnen.
  useEffect(() => {
    if (open) setStep(0);
  }, [open ]);

  // Ziel-Element vermessen (Schrittwechsel, Resize und laufend, weil die
  // Shell nach dem Login kurz später fertig rendert).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setRect(measure(def?.target));
    update();
    const iv = setInterval(update, 400);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(iv);
      window.removeEventListener('resize', update);
    };
  }, [open, step, def?.target]);

  const close = () => {
    if (user && !user.tutorialSeenAt) {
      // Optimistisch lokal markieren, damit die Tour in dieser Sitzung auf
      // keinen Fall erneut aufspringt; serverseitig persistent speichern.
      setUser({ ...user, tutorialSeenAt: new Date().toISOString() });
      void patch<PublicUser>('/users/me', { tutorialSeen: true })
        .then((updated) => {
          const current = useStore.getState().user;
          if (current && updated && typeof updated === 'object') setUser({ ...current, ...updated });
        })
        .catch(() => undefined);
    }
    setOpen(false);
  };

  const next = () => {
    if (step >= total - 1) close();
    else setStep(step + 1);
  };
  const back = () => setStep(Math.max(0, step - 1));

  // Tastatur: Pfeile blättern, Esc überspringt/schließt (Capture-Phase,
  // damit die Shell-Kürzel nicht gleichzeitig feuern).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        back();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, total, user]);

  if (!open || !def || !text) return null;
  const isLast = step >= total - 1;

  return (
    <div className="fixed inset-0 z-[95]" data-testid="tour-overlay" role="dialog" aria-modal="true" aria-label={text.title}>
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-nexa-violet transition-all duration-300"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(3, 3, 10, 0.66)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}
      <div
        className="absolute w-[min(92vw,360px)] rounded-2xl border border-nexa-border bg-nexa-panel3 p-5 shadow-2xl animate-pop-in"
        style={cardPosition(rect)}
        data-testid="tour-card"
      >
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" aria-hidden>{def.icon}</span>
          <div className="min-w-0">
            <h2 className="font-bold text-[17px] leading-snug">{text.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-nexa-muted">{text.body}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-medium text-nexa-muted">{fmt(t.tutorial.progress, { current: step + 1, total })}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nexa-panel2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-nexa-violet to-nexa-cyan transition-all duration-300"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            data-testid="tour-skip"
            className="mr-auto px-2 py-2 text-sm font-medium text-nexa-muted hover:text-nexa-text"
          >
            {t.tutorial.skip}
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              data-testid="tour-back"
              className="rounded-lg bg-nexa-panel2 px-4 py-2 text-sm font-semibold hover:bg-nexa-border"
            >
              {t.tutorial.back}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            data-testid="tour-next"
            className="rounded-lg bg-gradient-to-r from-nexa-violet to-nexa-cyan px-5 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            {isLast ? t.tutorial.finish : t.tutorial.next}
          </button>
        </div>
      </div>
    </div>
  );
}
