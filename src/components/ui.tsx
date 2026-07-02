import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fileToDataUrl } from '../lib/utils';

// ── Toasts ──────────────────────────────────────────────────────────────────

interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'err' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind === 'ok' ? 'toast-ok' : t.kind === 'err' ? 'toast-err' : ''}`}>
              {t.kind === 'ok' ? '✓ ' : t.kind === 'err' ? '⚠ ' : ''}{t.text}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  title, onClose, children, footer, wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        // eenvoudige focus-trap
        const els = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    // focus in de modal zetten
    setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.btn-icon)');
      el?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{title}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ── Bevestiging ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  title, message, confirmLabel = 'Verwijderen', danger = true, onConfirm, onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

// ── Formulier-hulpjes ───────────────────────────────────────────────────────

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function CheckRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="big" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// ── Score-ring ──────────────────────────────────────────────────────────────

export function ScoreRing({ percent, color }: { percent: number; color?: string }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const clampP = Math.max(0, Math.min(100, percent));
  const col = color ?? (clampP >= 70 ? 'var(--ok)' : clampP >= 45 ? 'var(--warn)' : 'var(--err)');
  return (
    <div className="score-ring" role="img" aria-label={`Score: ${clampP} procent`}>
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="13" />
        <circle
          cx="74" cy="74" r={r} fill="none" stroke={col} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${(clampP / 100) * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="val" style={{ color: col }}>{clampP}%</div>
    </div>
  );
}

// ── Afbeelding-kiezer (upload → data-URL) ───────────────────────────────────

export function ImagePicker({
  value, onChange, label = 'Afbeelding',
}: { value?: string; onChange: (url: string | undefined) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <label>{label}</label>
      {value ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <img src={value} alt="" style={{ height: 56, borderRadius: 8, border: '1px solid var(--line)' }} />
          <button className="btn btn-sm btn-ghost" onClick={() => onChange(undefined)}>Verwijderen</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()}>
            📷 Afbeelding kiezen…
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          onChange(await fileToDataUrl(f));
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Kopieerknop ─────────────────────────────────────────────────────────────

export function CopyButton({ text, label = 'Kopiëren' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Gekopieerd naar klembord', 'ok');
        } catch {
          toast('Kopiëren mislukt', 'err');
        }
      }}
    >
      📋 {label}
    </button>
  );
}
