import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  BingoConfig, ChecklistConfig, CrosswordConfig, DictationConfig, FlashcardsConfig,
  Folder, HangmanConfig, MemoryConfig, MindmapConfig, PairsConfig, PlannerConfig,
  PollConfig, QuizConfig, ScrambleConfig, SpinnerConfig, SplitWorksheetConfig,
  TimelineConfig, WebquestConfig, Widget, WidgetTypeId, WordsearchConfig,
} from '../lib/types';
import { askAI, extractJson } from '../lib/ai';
import { AI_GEN_TYPES, buildWidgetGenPrompt, sanitizeGeneratedWidgets } from '../lib/aiWidgetGen';
import type { GeneratedResult } from '../lib/aiWidgetGen';
import { AIErrorBox, AIGate, AIReviewNote, AIWorkingBox } from '../components/aiCommon';
import { CheckRow, Field, useToast } from '../components/ui';
import { getFolders, saveFolder, saveWidget } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { lintQuiz } from '../lib/linter';
import type { LintWarning } from '../lib/linter';
import { clamp, uid } from '../lib/utils';

// ── Hulpjes voor de voorvertoning ───────────────────────────────────────────

const MAX_SOURCE_COMFORT = 60000;

function truncate(s: string, max = 96): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function n(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

interface Summary {
  count: number;
  label: string;
  lines: string[];
  /** Aantal items dat níet in lines getoond wordt. */
  more: number;
}

function listSummary(items: string[], singular: string, plural: string): Summary {
  return {
    count: items.length,
    label: n(items.length, singular, plural),
    lines: items.slice(0, 3).map((s) => truncate(s)),
    more: Math.max(0, items.length - 3),
  };
}

/** Compacte inhoudsamenvatting per widgettype: aantal + de eerste items als tekst. */
function widgetSummary(w: Widget): Summary {
  switch (w.type) {
    case 'quiz':
    case 'worksheet':
    case 'exitticket': {
      const qs = (w.config as QuizConfig).questions.filter((q) => q.type !== 'info');
      return listSummary(qs.map((q) => (q.type === 'gap' ? q.text : q.prompt)), 'vraag', 'vragen');
    }
    case 'splitworksheet': {
      const qs = (w.config as SplitWorksheetConfig).questions.filter((q) => q.type !== 'info');
      return listSummary(qs.map((q) => (q.type === 'gap' ? q.text : q.prompt)), 'vraag', 'vragen');
    }
    case 'flashcards':
      return listSummary((w.config as FlashcardsConfig).cards.map((c) => `${c.front} → ${c.back}`), 'kaart', 'kaarten');
    case 'crossword':
      return listSummary((w.config as CrosswordConfig).entries.map((e) => `${e.word} — ${e.clue}`), 'woord', 'woorden');
    case 'wordsearch':
      return listSummary((w.config as WordsearchConfig).words, 'woord', 'woorden');
    case 'memory':
      return listSummary((w.config as MemoryConfig).pairs.map((p) => `${p.a} ↔ ${p.b}`), 'paar', 'paren');
    case 'hangman':
      return listSummary((w.config as HangmanConfig).words.map((x) => (x.hint ? `${x.word} — ${x.hint}` : x.word)), 'woord', 'woorden');
    case 'pairs':
      return listSummary((w.config as PairsConfig).pairs.map((p) => `${p.left} ↔ ${p.right}`), 'paar', 'paren');
    case 'timeline':
      return listSummary((w.config as TimelineConfig).events.map((e) => `${e.date}: ${e.title}`), 'gebeurtenis', 'gebeurtenissen');
    case 'scramble':
      return listSummary((w.config as ScrambleConfig).items.map((i) => i.text), 'item', 'items');
    case 'dictation':
      return listSummary((w.config as DictationConfig).sentences.map((s) => s.text), 'zin', 'zinnen');
    case 'poll': {
      const cfg = w.config as PollConfig;
      return {
        count: cfg.options.length,
        label: n(cfg.options.length, 'optie', 'opties'),
        lines: [truncate(cfg.question), ...cfg.options.slice(0, 2).map((o) => truncate(o))],
        more: Math.max(0, cfg.options.length - 2),
      };
    }
    case 'checklist':
      return listSummary((w.config as ChecklistConfig).items.map((i) => i.text), 'stap', 'stappen');
    case 'webquest':
      return listSummary((w.config as WebquestConfig).steps.map((s) => s.title), 'stap', 'stappen');
    case 'mindmap': {
      const cfg = w.config as MindmapConfig;
      const branches = cfg.outline.split('\n').map((l) => l.trim()).filter(Boolean);
      return {
        count: branches.length,
        label: n(branches.length, 'tak', 'takken'),
        lines: [truncate(`Centraal: ${cfg.root}`), ...branches.slice(0, 2).map((b) => truncate(b))],
        more: Math.max(0, branches.length - 2),
      };
    }
    case 'planner':
      return listSummary(
        (w.config as PlannerConfig).sections.map((s) => `${s.title} (${s.tasks.length} ${n(s.tasks.length, 'taak', 'taken')})`),
        'onderdeel', 'onderdelen'
      );
    case 'bingo':
      return listSummary((w.config as BingoConfig).items, 'begrip', 'begrippen');
    case 'spinner':
      return listSummary((w.config as SpinnerConfig).items, 'item', 'items');
    default:
      return { count: 0, label: 'items', lines: [], more: 0 };
  }
}

/** Linter-signalen voor de quiz-familie; null voor andere types. */
function lintFor(w: Widget): LintWarning[] | null {
  if (w.type === 'quiz' || w.type === 'worksheet' || w.type === 'exitticket') {
    return lintQuiz(w.config as QuizConfig);
  }
  if (w.type === 'splitworksheet') {
    return lintQuiz({ questions: (w.config as SplitWorksheetConfig).questions, layout: 'scroll' });
  }
  return null;
}

// ── Vaste teksten ───────────────────────────────────────────────────────────

const STEPS = [
  { nr: 1, title: 'Plak je tekst', text: 'Een hoofdstuk, artikel of stuk cursus — of beschrijf gewoon wat je wil.' },
  { nr: 2, title: 'Kies widgettypes', text: 'Quiz, flitskaarten, kruiswoordraadsel … meerdere tegelijk kan.' },
  { nr: 3, title: 'Kijk na en bewaar', text: 'Jij beslist wat goed genoeg is; bijschaven kan altijd in de editor.' },
];

// ── De pagina ───────────────────────────────────────────────────────────────

type Phase = 'idle' | 'busy' | 'preview' | 'saved';

export function AIStudioPage() {
  const toast = useToast();

  // invoer (blijft bewaard doorheen de fases zodat "Opnieuw genereren" werkt)
  const [source, setSource] = useState('');
  const [wish, setWish] = useState('');
  const [audience, setAudience] = useState('');
  const [itemCount, setItemCount] = useState(0);
  const [goals, setGoals] = useState('');
  const [differentiate, setDifferentiate] = useState(false);
  const [types, setTypes] = useState<WidgetTypeId[]>(['quiz']);

  // verloop
  const [phase, setPhase] = useState<Phase>('idle');
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Widget[]>([]);

  // bewaren
  const [folderId, setFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  const ctrlRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const folders: Folder[] = useMemo(() => getFolders(), [phase]);
  const canGenerate = types.length > 0 && (source.trim() !== '' || wish.trim() !== '');
  const sourceTooLong = source.length > MAX_SOURCE_COMFORT;
  const checkedCount = result ? result.widgets.filter((w) => checked[w.id]).length : 0;

  const toggleType = (t: WidgetTypeId) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const renameWidget = (id: string, title: string) =>
    setResult((r) => (r ? { ...r, widgets: r.widgets.map((w) => (w.id === id ? { ...w, title } : w)) } : r));

  function loadFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setSource(String(reader.result ?? ''));
      toast(`Bestand "${f.name}" geladen`, 'ok');
    };
    reader.onerror = () => toast('Het bestand kon niet gelezen worden', 'err');
    reader.readAsText(f);
  }

  function generate() {
    if (!canGenerate || phase === 'busy') return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setPhase('busy');
    setError('');
    setStream('');
    const { system, prompt } = buildWidgetGenPrompt({
      source,
      wish,
      types: AI_GEN_TYPES.filter((t) => types.includes(t)),
      itemCount,
      audience,
      goals,
      differentiate,
    });
    let acc = '';
    askAI({
      system,
      prompt,
      task: 'widgets uit bron',
      maxTokens: 16000,
      signal: ctrl.signal,
      onDelta: (t) => { acc += t; setStream(acc); },
    })
      .then((full) => {
        const res = sanitizeGeneratedWidgets(extractJson(full));
        if (res.widgets.length === 0) {
          setError(res.warnings.join(' ') || 'De AI leverde geen bruikbare widgets op. Probeer het opnieuw.');
          setPhase('idle');
          return;
        }
        setResult(res);
        setChecked(Object.fromEntries(res.widgets.map((w) => [w.id, true])));
        setPhase('preview');
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setPhase('idle');
      });
  }

  function cancel() {
    ctrlRef.current?.abort();
    setPhase('idle');
  }

  function saveAll() {
    if (!result || checkedCount === 0) return;
    let targetFolder: string | null = folderId && folderId !== '__new__' ? folderId : null;
    if (folderId === '__new__') {
      const name = newFolderName.trim();
      if (!name) return;
      const folder: Folder = { id: uid(), name, color: '#7c3aed', createdAt: Date.now() };
      saveFolder(folder);
      targetFolder = folder.id;
    }
    const toSave = result.widgets
      .filter((w) => checked[w.id])
      .map((w) => ({ ...w, title: w.title.trim() || getTypeDef(w.type).name, folderId: targetFolder }));
    toSave.forEach((w) => saveWidget(w));
    setSaved(toSave);
    setNewFolderName('');
    setFolderId(targetFolder ?? '');
    toast(`${toSave.length} ${n(toSave.length, 'widget', 'widgets')} bewaard`, 'ok');
    setPhase('saved');
  }

  function resetForNext() {
    setResult(null);
    setSaved([]);
    setChecked({});
    setStream('');
    setError('');
    setPhase('idle');
  }

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>✨ AI-studio</h1>
          <p className="sub">Van bronmateriaal naar kant-en-klare oefeningen in één minuut.</p>
        </div>
      </div>

      {/* 3 stappen */}
      <ol style={{
        listStyle: 'none', padding: 0, margin: '0 0 22px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10,
      }}>
        {STEPS.map((s) => (
          <li key={s.nr} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span aria-hidden style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 2,
              background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: '0.85rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{s.nr}</span>
            <span>
              <strong>Stap {s.nr}: {s.title}</strong>
              <span className="hint" style={{ display: 'block', marginTop: 2 }}>{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <AIGate>
        {(phase === 'idle' || phase === 'busy') && (
          <div className="card" style={{ padding: 18, display: 'grid', gap: 4 }}>
            <fieldset disabled={phase === 'busy'} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
              <Field label="Bronmateriaal">
                <textarea
                  className="textarea"
                  rows={10}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Plak hier je cursustekst, hoofdstuk of artikel … (mag ook leeg blijven als je hieronder beschrijft wat je wil)"
                  aria-label="Bronmateriaal"
                  aria-describedby="bron-teller"
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}>
                    📄 Bestand laden (.txt/.md)
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) loadFile(f);
                      e.target.value = '';
                    }}
                  />
                  <span
                    id="bron-teller"
                    className="hint"
                    aria-live="polite"
                    style={sourceTooLong ? { color: 'var(--warn)', fontWeight: 600 } : undefined}
                  >
                    {source.length.toLocaleString('nl-BE')} tekens
                    {sourceTooLong && ' — ⚠️ erg lang: knip in kleinere stukken voor een beter resultaat'}
                  </span>
                </div>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 14px' }}>
                <Field label="Wat wil je precies?" hint="Hoe concreter, hoe beter het resultaat.">
                  <input
                    className="input"
                    type="text"
                    value={wish}
                    onChange={(e) => setWish(e.target.value)}
                    placeholder='bv. "10 vragen over de waterkringloop"'
                    aria-label="Wat wil je precies?"
                  />
                </Field>
                <Field label="Doelgroep" hint="Bepaalt taalniveau en moeilijkheid.">
                  <input
                    className="input"
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder='bv. "5e leerjaar" of "3 ASO"'
                    aria-label="Doelgroep"
                  />
                </Field>
              </div>

              <Field label="Aantal vragen/items per widget" hint="0 = de AI kiest zelf een passend aantal.">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={40}
                  value={itemCount}
                  onChange={(e) => setItemCount(clamp(Math.round(Number(e.target.value) || 0), 0, 40))}
                  style={{ maxWidth: 140 }}
                  aria-label="Aantal vragen of items per widget (0 = de AI kiest)"
                />
              </Field>

              <Field label="Leerdoelen (optioneel, één per lijn)" hint="Vragen worden aan je doelen gekoppeld — handig voor score-per-doel bij de resultaten.">
                <textarea
                  className="textarea"
                  rows={3}
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder={'bv.\nDe leerling benoemt de fasen van de waterkringloop.\nDe leerling legt verdamping uit in eigen woorden.'}
                  aria-label="Leerdoelen, één per lijn"
                />
              </Field>

              <CheckRow
                checked={differentiate}
                onChange={setDifferentiate}
                label="Differentiatie meenemen (hints, steuntaal, niveaus basis/kern/uitbreiding)"
              />

              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label id="type-kiezer-label">Widgettypes</label>
                <div role="group" aria-labelledby="type-kiezer-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {AI_GEN_TYPES.map((t) => {
                    const def = getTypeDef(t);
                    const on = types.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        className="btn btn-sm"
                        aria-pressed={on}
                        onClick={() => toggleType(t)}
                        style={{
                          border: `1.5px solid ${on ? 'var(--brand)' : 'var(--line-strong)'}`,
                          background: on ? 'var(--brand-soft)' : 'transparent',
                        }}
                      >
                        <span aria-hidden>{def.icon}</span> {def.name}{on && <span aria-hidden> ✓</span>}
                      </button>
                    );
                  })}
                </div>
                <span className="hint">Meerdere types tegelijk kan — je krijgt dan één widget per type.</span>
              </div>
            </fieldset>

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 16, display: 'grid', gap: 12 }}>
              {error && phase === 'idle' && (
                <AIErrorBox error={error} onRetry={canGenerate ? generate : undefined} />
              )}
              {phase === 'busy' ? (
                <AIWorkingBox streamText={stream} label="De AI maakt je widgets…" onCancel={cancel} />
              ) : (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-lg" onClick={generate} disabled={!canGenerate}>
                    ✨ Genereer {types.length > 1 ? `${types.length} widgets` : 'widget'}
                  </button>
                  {!canGenerate && (
                    <span className="hint">
                      Plak bronmateriaal óf beschrijf wat je wil, en kies minstens één widgettype.
                    </span>
                  )}
                  {result && result.widgets.length > 0 && (
                    <button className="btn btn-ghost" onClick={() => setPhase('preview')}>
                      Terug naar de voorstellen →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'preview' && result && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setPhase('idle')}>← Invoer aanpassen</button>
              <button className="btn btn-ghost" onClick={generate}>🔁 Opnieuw genereren</button>
              <span style={{ flex: 1 }} />
              <span className="hint">
                {result.widgets.length} {n(result.widgets.length, 'voorstel', 'voorstellen')}
              </span>
            </div>

            <AIReviewNote />

            {result.warnings.length > 0 && (
              <div
                role="status"
                style={{
                  background: 'var(--warn-soft)', border: '1px solid var(--warn)',
                  borderRadius: 10, padding: '10px 14px', display: 'grid', gap: 4, fontSize: '0.9rem',
                }}
              >
                {result.warnings.map((wtext, i) => (
                  <div key={i}>⚠️ {wtext}</div>
                ))}
              </div>
            )}

            {result.widgets.map((w) => {
              const def = getTypeDef(w.type);
              const sum = widgetSummary(w);
              const lint = lintFor(w);
              const on = !!checked[w.id];
              return (
                <div key={w.id} className="card" style={{ padding: 14, display: 'grid', gap: 10, opacity: on ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setChecked((c) => ({ ...c, [w.id]: e.target.checked }))}
                      aria-label={`${def.name} "${w.title}" bewaren`}
                      style={{ width: 20, height: 20, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span
                      aria-hidden
                      style={{
                        width: 38, height: 38, borderRadius: 10, background: def.color, color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.2rem', flexShrink: 0,
                      }}
                    >
                      {def.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <input
                        className="input input-sm"
                        type="text"
                        value={w.title}
                        onChange={(e) => renameWidget(w.id, e.target.value)}
                        aria-label={`Titel van de ${def.name.toLowerCase()}`}
                      />
                      <span className="hint" style={{ display: 'block', marginTop: 3 }}>
                        {def.name} · {sum.count} {sum.label}
                      </span>
                    </div>
                  </div>

                  {sum.lines.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 30, display: 'grid', gap: 3, color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      {sum.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                      {sum.more > 0 && (
                        <li style={{ listStyle: 'none', color: 'var(--text-faint)' }}>
                          … en nog {sum.more} {n(sum.more, 'andere', 'andere')}
                        </li>
                      )}
                    </ul>
                  )}

                  {lint && lint.length > 0 && (
                    <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 8, display: 'grid', gap: 3 }}>
                      {lint.map((lw, i) => (
                        <span key={i} className="hint" style={{ color: 'var(--warn)' }}>
                          🔎 {lw.questionNo !== null ? `Vraag ${lw.questionNo}: ` : ''}{lw.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="card" style={{ padding: 16, display: 'grid', gap: 4 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>💾 Bewaren</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 14px' }}>
                <Field label="In welke map?">
                  <select
                    className="select"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    aria-label="Map om de widgets in te bewaren"
                  >
                    <option value="">📂 Hoofdmap (geen map)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>📁 {f.name}</option>
                    ))}
                    <option value="__new__">🆕 Nieuwe map…</option>
                  </select>
                </Field>
                {folderId === '__new__' && (
                  <Field label="Naam van de nieuwe map">
                    <input
                      className="input"
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder='bv. "Thema water"'
                      aria-label="Naam van de nieuwe map"
                    />
                  </Field>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={saveAll}
                  disabled={checkedCount === 0 || (folderId === '__new__' && !newFolderName.trim())}
                >
                  ✔ {checkedCount} {n(checkedCount, 'widget', 'widgets')} bewaren
                </button>
                {checkedCount === 0 && <span className="hint">Vink minstens één widget aan om te bewaren.</span>}
                {checkedCount > 0 && folderId === '__new__' && !newFolderName.trim() && (
                  <span className="hint">Geef de nieuwe map eerst een naam.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'saved' && (
          <div className="card" style={{ padding: 22, display: 'grid', gap: 16 }}>
            <div style={{ textAlign: 'center', display: 'grid', gap: 4, justifyItems: 'center' }}>
              <span style={{ fontSize: '2.2rem' }} aria-hidden>🎉</span>
              <h2 style={{ margin: 0 }}>
                Klaar — {saved.length} {n(saved.length, 'widget', 'widgets')} bewaard
              </h2>
              <p className="hint" style={{ margin: 0, maxWidth: 460 }}>
                Test elke widget zelf even uit vóór je ze aan je klas geeft — zo merk je meteen
                of alles klopt.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {saved.map((w) => {
                const def = getTypeDef(w.type);
                return (
                  <div
                    key={w.id}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                      border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px',
                    }}
                  >
                    <span aria-hidden style={{ fontSize: '1.15rem' }}>{def.icon}</span>
                    <strong style={{ flex: 1, minWidth: 160 }}>{w.title}</strong>
                    <Link className="btn btn-sm btn-ghost" to={`/bewerk/${w.id}`}>✏️ Bewerken</Link>
                    <Link className="btn btn-sm btn-ghost" to={`/speel/${w.code}`}>▶ Uittesten</Link>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={resetForNext}>✨ Nog iets maken</button>
              <Link className="btn btn-ghost" to="/widgets">Naar mijn widgets</Link>
            </div>
          </div>
        )}
      </AIGate>

      <p className="hint" style={{ marginTop: 28, maxWidth: 720 }}>
        🔒 <strong>Wat verlaat dit toestel?</strong> Alleen wat je hierboven invult — het bronmateriaal
        en je opdracht — gaat naar je gekozen AI-aanbieder. Leerlingnamen of resultaten worden nooit
        meegestuurd. De voorstellen verschijnen eerst hier en jij kijkt alles na vóór je het met
        leerlingen gebruikt.
      </p>
    </div>
  );
}
