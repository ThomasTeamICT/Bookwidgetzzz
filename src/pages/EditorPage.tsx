import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSubmissions, getWidget, saveWidget } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { Widget } from '../lib/types';
import { CheckRow, Field, Modal, useToast } from '../components/ui';
import { ShareModal } from '../components/ShareModal';
import { AIEditorPanel } from '../components/AIEditorPanel';
import { AI_GEN_TYPES } from '../lib/aiWidgetGen';
import { saveCustomTemplate } from '../lib/customTemplates';
import { lintQuiz } from '../lib/linter';
import type { QuizConfig } from '../lib/types';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initial = useMemo(() => (id ? getWidget(id) : undefined), [id]);
  const [widget, setWidget] = useState<Widget | undefined>(initial);
  // Zelfde route, andere widget (terug/vooruit in de browser tussen twee
  // editors): de pagina blijft gemonteerd en useState houdt anders de vorige
  // widget vast — met als gevolg de verkeerde inhoud op het scherm.
  useEffect(() => {
    if (!initial || widget?.id === initial.id) return;
    // Eerst de vorige widget wegschrijven: de autosave-debounce hieronder
    // wordt door de state-wissel geannuleerd en de laatste 500 ms gingen
    // anders verloren.
    if (widget) saveWidget(widget);
    setWidget(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const [tab, setTab] = useState<'content' | 'settings'>('content');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // automatisch opslaan met korte debounce
  useEffect(() => {
    if (!widget) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveWidget(widget);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    }, 500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [widget]);

  // flush bij unmount: wie binnen de debounce op "Terug" klikt, verliest anders
  // de wijzigingen van de laatste 500 ms — en bij F5/tabblad sluiten (pagehide),
  // want dan draait de React-cleanup niet
  const widgetRef = useRef(widget);
  useEffect(() => { widgetRef.current = widget; }, [widget]);
  useEffect(() => {
    const flush = () => { if (widgetRef.current) saveWidget(widgetRef.current); };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  if (!widget) {
    return (
      <div className="page page-narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h1>Widget niet gevonden</h1>
        <p style={{ color: 'var(--text-soft)' }}>Deze widget bestaat niet (meer) in deze browser.</p>
        <Link to="/widgets" className="btn btn-primary">← Naar mijn widgets</Link>
      </div>
    );
  }

  const def = getTypeDef(widget.type);
  const subCount = getSubmissions(widget.id).length;

  return (
    <div className="appshell">
      <header className="topbar">
        <button className="btn btn-quiet btn-sm" onClick={() => navigate('/widgets')} aria-label="Terug naar mijn widgets">
          ← Terug
        </button>
        <span className="type-icon" style={{ background: def.color, width: 34, height: 34, fontSize: '1.05rem', borderRadius: 9 }} aria-hidden>
          {def.icon}
        </span>
        <input
          className="input input-sm"
          style={{ maxWidth: 340, fontWeight: 700 }}
          value={widget.title}
          onChange={(e) => setWidget({ ...widget, title: e.target.value })}
          aria-label="Titel van de widget"
        />
        <span className="hint" aria-live="polite" style={{ minWidth: 86 }}>
          {savedFlash ? '✓ opgeslagen' : ''}
        </span>
        <div className="topbar-spacer" />
        <span className="badge" title="Klascode" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>{widget.code}</span>
        {def.hasSubmissions && (
          <Link to={`/resultaten/${widget.id}`} className="btn btn-sm btn-ghost">📊 Resultaten ({subCount})</Link>
        )}
        {['quiz', 'worksheet', 'exitticket'].includes(widget.type) && (
          <Link to={`/print/${widget.id}`} className="btn btn-sm btn-ghost" title="Afdrukken of als PDF bewaren">🖨 Afdrukken</Link>
        )}
        {(AI_GEN_TYPES.includes(widget.type) || widget.type === 'videoquiz') && (
          <button
            className="btn btn-sm btn-ai"
            onClick={() => setAiOpen(true)}
            title="Vragen bijmaken, hints aanvullen, afleiders versterken — met AI"
          >
            ✨ AI-assistent
          </button>
        )}
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setTemplateOpen(true)}
          title="Bewaar deze widget als eigen sjabloon voor later hergebruik"
        >
          ⭐ Bewaar als sjabloon
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setShareOpen(true)}>📤 Delen</button>
        <button
          className={`btn btn-sm ${previewMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setPreviewMode((v) => !v); setPreviewKey((k) => k + 1); }}
          aria-pressed={previewMode}
        >
          {previewMode ? '✏️ Terug naar bewerken' : '▶ Uitproberen'}
        </button>
      </header>

      {previewMode ? (
        <main className="player-shell" style={{ flex: 1, ['--player-accent' as any]: widget.settings.accentColor }}>
          <div className="callout warn" style={{ maxWidth: 860, margin: '14px auto 0', width: 'calc(100% - 36px)' }}>
            <span aria-hidden>👀</span>
            <div>Voorbeeldmodus — zo ziet je leerling de widget. Er wordt niets opgeslagen.
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 10 }} onClick={() => setPreviewKey((k) => k + 1)}>↺ Herstart voorbeeld</button>
            </div>
          </div>
          <div className={`player-main ${def.wide ? 'player-main-wide' : ''}`}>
            <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Widget laden…</div>}>
              <def.Player key={previewKey} widget={widget} studentName="Voorbeeld" preview onComplete={() => {}} />
            </React.Suspense>
          </div>
        </main>
      ) : (
        <main className="page" style={{ paddingTop: 20 }}>
          <div className="editor-layout">
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }} role="tablist" aria-label="Editor-onderdelen">
                <button className={`btn btn-sm ${tab === 'content' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>
                  📝 Inhoud
                </button>
                <button className={`btn btn-sm ${tab === 'settings' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>
                  ⚙️ Instellingen
                </button>
              </div>
              {tab === 'content' ? (
                // de editormodule wordt lazy geladen (zie registry): even een laadmelding tonen
                <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Widget laden…</div>}>
                  <def.Editor config={widget.config} onChange={(config: unknown) => setWidget({ ...widget, config })} />
                </React.Suspense>
              ) : (
                <SettingsPanel widget={widget} onChange={setWidget} />
              )}
            </div>
            <aside className="card card-pad" style={{ position: 'sticky', top: 76 }}>
              <h3>{def.icon} {def.name}</h3>
              <p style={{ color: 'var(--text-soft)', fontSize: '0.9rem' }}>{def.tagline}</p>
              <hr className="divider" />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-soft)', marginBottom: 8 }}>
                <strong>Zo deel je deze widget:</strong>
              </p>
              <ol style={{ fontSize: '0.88rem', color: 'var(--text-soft)', paddingLeft: 18, margin: 0 }}>
                <li>Klik op <em>Uitproberen</em> om alles zelf te testen.</li>
                <li>Klik op <em>Delen</em> en geef je leerlingen de code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong> of de link.</li>
                {def.hasSubmissions && <li>Volg de inzendingen op via <em>Resultaten</em>.</li>}
              </ol>
              <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => setShareOpen(true)}>
                📤 Delen met je klas
              </button>
              {['quiz', 'worksheet', 'exitticket', 'splitworksheet'].includes(widget.type) && (() => {
                const warnings = lintQuiz(widget.config as QuizConfig);
                if (warnings.length === 0) return null;
                return (
                  <>
                    <hr className="divider" />
                    <h3 style={{ fontSize: '0.95rem' }}>🔍 Vraag-check</h3>
                    <p className="hint" style={{ marginTop: -4 }}>Signalen uit de toetsliteratuur — jij beslist.</p>
                    <ul style={{ paddingLeft: 16, margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>
                      {warnings.slice(0, 6).map((w, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {w.questionNo !== null && <strong>V{w.questionNo}: </strong>}{w.text}
                        </li>
                      ))}
                      {warnings.length > 6 && <li>… en nog {warnings.length - 6} signalen.</li>}
                    </ul>
                  </>
                );
              })()}
            </aside>
          </div>
        </main>
      )}

      {shareOpen && <ShareModal widget={widget} onClose={() => setShareOpen(false)} />}
      {aiOpen && (
        <AIEditorPanel
          widget={widget}
          onClose={() => setAiOpen(false)}
          onApply={(config: unknown, note: string) => {
            setWidget({ ...widget, config });
            toast(`✨ ${note}`, 'ok');
          }}
        />
      )}
      {templateOpen && <SaveTemplateModal widget={widget} onClose={() => setTemplateOpen(false)} />}
    </div>
  );
}

function SaveTemplateModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(widget.title);

  const save = () => {
    if (!name.trim()) return;
    try {
      saveCustomTemplate(name, widget);
      toast('Sjabloon bewaard — je vindt het terug bij "Nieuwe widget"', 'ok');
      onClose();
    } catch {
      toast('Bewaren mislukt: de lokale opslag is vol. Verwijder oude widgets of sjablonen.', 'err');
    }
  };

  return (
    <Modal
      title="Bewaar als sjabloon"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>⭐ Bewaren</button>
        </>
      }
    >
      <Field
        label="Naam van het sjabloon"
        hint="Bewaart de inhoud én instellingen van deze widget als startpunt voor nieuwe widgets."
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="bv. Weektoets woordenschat"
        />
      </Field>
    </Modal>
  );
}

function SettingsPanel({ widget, onChange }: { widget: Widget; onChange: (w: Widget) => void }) {
  const def = getTypeDef(widget.type);
  const s = widget.settings;
  const set = (patch: Partial<typeof s>) => onChange({ ...widget, settings: { ...s, ...patch } });

  return (
    <div className="card card-pad">
      <h3>Weergave</h3>
      <Field label="Accentkleur voor de leerling">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="color" value={s.accentColor} onChange={(e) => set({ accentColor: e.target.value })} aria-label="Accentkleur" />
          <span className="hint">{s.accentColor}</span>
        </div>
      </Field>
      <Field label="Instructies vóór de start (optioneel)">
        <textarea className="textarea" rows={2} value={s.instructions} placeholder="bv. Je mag je woordenboek gebruiken."
          onChange={(e) => set({ instructions: e.target.value })} />
      </Field>

      <hr className="divider" />
      <h3>Gedrag</h3>
      <CheckRow checked={s.shuffle} onChange={(v) => set({ shuffle: v })} label="Vragen/kaarten in willekeurige volgorde" />
      {def.hasScore && (
        <>
          <CheckRow checked={s.showFeedback} onChange={(v) => set({ showFeedback: v })} label="Juiste antwoorden tonen na indienen" />
          <CheckRow checked={s.showScore} onChange={(v) => set({ showScore: v })} label="Score tonen aan de leerling" />
        </>
      )}
      {def.hasSubmissions && (
        <CheckRow checked={s.requireName} onChange={(v) => set({ requireName: v })} label="Leerling moet eerst een naam invullen" />
      )}

      <hr className="divider" />
      <h3>Beperkingen</h3>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Field label="Tijdslimiet (minuten)" hint="0 = geen limiet">
          <input className="input input-sm" type="number" min={0} max={240} style={{ maxWidth: 110 }}
            value={s.timeLimitMin}
            onChange={(e) => set({ timeLimitMin: Math.max(0, parseInt(e.target.value) || 0) })} />
        </Field>
        <Field label="Max. pogingen per leerling" hint="0 = onbeperkt">
          <input className="input input-sm" type="number" min={0} max={20} style={{ maxWidth: 110 }}
            value={s.maxAttempts}
            onChange={(e) => set({ maxAttempts: Math.max(0, parseInt(e.target.value) || 0) })} />
        </Field>
      </div>

      <hr className="divider" />
      <h3>Toets &amp; deadline</h3>
      <CheckRow
        checked={s.examMode ?? false}
        onChange={(v) => set({ examMode: v })}
        label="Toetsmodus: volledig scherm vragen en registreren wanneer de leerling het venster verlaat"
      />
      <Field label="Afsluiten na (deadline, optioneel)" hint="Na dit tijdstip kunnen leerlingen niet meer starten.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input input-sm" type="datetime-local" style={{ maxWidth: 230 }}
            value={s.expiresAt ?? ''}
            onChange={(e) => set({ expiresAt: e.target.value || undefined })}
          />
          {s.expiresAt && (
            <button className="btn btn-sm btn-quiet" onClick={() => set({ expiresAt: undefined })}>✕ Wissen</button>
          )}
        </div>
      </Field>
    </div>
  );
}
