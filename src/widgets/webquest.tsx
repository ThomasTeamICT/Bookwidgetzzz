import { useEffect, useMemo, useRef, useState } from 'react';
import type { WebquestConfig, WebquestStep } from '../lib/types';
import { pct, uid } from '../lib/utils';
import { Field, ImagePicker } from '../components/ui';
import { EditorProps, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/** Splits inhoud in alinea's op witregels. */
function toParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Zorg dat een link een protocol heeft, anders opent hij relatief. */
function ensureHttp(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function stepTitle(step: WebquestStep, index: number): string {
  return step.title.trim() || `Stap ${index + 1}`;
}

/** Volgt een media query, voor de smalle-scherm-stepper. */
function useIsNarrow(maxWidth = 720): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

function newStep(): WebquestStep {
  return { id: uid(), title: '', content: '', links: [] };
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function WebquestEditor({ config, onChange }: EditorProps<WebquestConfig>) {
  const steps = config.steps ?? [];

  const setSteps = (next: WebquestStep[]) => onChange({ ...config, steps: next });
  const update = (i: number, step: WebquestStep) => {
    const next = steps.slice();
    next[i] = step;
    setSteps(next);
  };

  return (
    <div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Een WebQuest leidt de leerling stap voor stap door een online zoektocht. Per stap geef je uitleg,
        eventueel een afbeelding en links naar websites die de leerling moet raadplegen.
      </p>

      {steps.map((s, i) => (
        <div className="editor-item" key={s.id}>
          <ItemHeader
            index={i}
            label={s.title.trim() || 'Nieuwe stap'}
            canUp={i > 0}
            canDown={i < steps.length - 1}
            onMoveUp={() => setSteps(moveItem(steps, i, i - 1))}
            onMoveDown={() => setSteps(moveItem(steps, i, i + 1))}
            onDelete={() => setSteps(steps.filter((_, j) => j !== i))}
            onDuplicate={() => {
              const copy: WebquestStep = { ...s, id: uid(), links: s.links.map((l) => ({ ...l })) };
              const next = steps.slice();
              next.splice(i + 1, 0, copy);
              setSteps(next);
            }}
          />
          <div className="editor-item-body">
            <Field label="Titel van de stap">
              <input
                className="input input-sm"
                value={s.title}
                placeholder="bv. Verken de bronnen"
                onChange={(e) => update(i, { ...s, title: e.target.value })}
              />
            </Field>
            <Field label="Inhoud" hint="Laat een lege regel (witregel) tussen alinea's — zo krijgt de leerling overzichtelijke tekst.">
              <textarea
                className="textarea"
                rows={5}
                value={s.content}
                placeholder={'Wat moet de leerling in deze stap doen?\n\nBegin na een witregel een nieuwe alinea.'}
                onChange={(e) => update(i, { ...s, content: e.target.value })}
              />
            </Field>
            <ImagePicker
              value={s.imageUrl}
              onChange={(imageUrl) => update(i, { ...s, imageUrl })}
              label="Afbeelding (optioneel)"
            />
            <div className="field">
              <label>Weblinks</label>
              {s.links.length === 0 && (
                <span className="hint">Nog geen links. Voeg websites toe die de leerling bij deze stap opent.</span>
              )}
              {s.links.map((l, j) => (
                <div className="option-row" key={j}>
                  <input
                    className="input input-sm"
                    placeholder="Naam (bv. Klimaatportaal)"
                    value={l.label}
                    aria-label={`Naam van link ${j + 1}`}
                    onChange={(e) => {
                      const links = s.links.slice();
                      links[j] = { ...l, label: e.target.value };
                      update(i, { ...s, links });
                    }}
                  />
                  <input
                    className="input input-sm"
                    type="url"
                    style={{ flex: 1.4 }}
                    placeholder="https://…"
                    value={l.url}
                    aria-label={`Adres van link ${j + 1}`}
                    onChange={(e) => {
                      const links = s.links.slice();
                      links[j] = { ...l, url: e.target.value };
                      update(i, { ...s, links });
                    }}
                  />
                  <button
                    className="btn btn-quiet btn-icon btn-sm"
                    aria-label={`Link ${j + 1} verwijderen`}
                    title="Link verwijderen"
                    onClick={() => update(i, { ...s, links: s.links.filter((_, k) => k !== j) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => update(i, { ...s, links: [...s.links, { label: '', url: '' }] })}
                >
                  + Link toevoegen
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button className="btn btn-primary" onClick={() => setSteps([...steps, newStep()])}>
        + Stap toevoegen
      </button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function WebquestPlayer({ widget, timeUp, onComplete }: PlayerProps<WebquestConfig>) {
  const steps = useMemo(
    () =>
      (widget.config.steps ?? []).filter(
        (s) => s.title.trim() || s.content.trim() || s.links.some((l) => l.url.trim())
      ),
    [widget.id]
  );

  const [active, setActive] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const narrow = useIsNarrow();

  const submittedRef = useRef(false);
  const doneRef = useRef(done);
  doneRef.current = done;

  const submit = (completed: Set<string>) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setFinished(true);
    const afgerond = steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => completed.has(s.id))
      .map(({ s, i }) => stepTitle(s, i));
    onComplete({
      answers: { afgerond },
      itemScores: null,
      earned: afgerond.length,
      max: steps.length,
    });
    window.scrollTo({ top: 0 });
  };

  // Tijd om? Meteen de huidige voortgang indienen.
  useEffect(() => {
    if (timeUp && steps.length > 0) submit(doneRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (steps.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen stappen ingesteld.</p>;
  }

  if (finished) {
    const count = steps.filter((s) => done.has(s.id)).length;
    const all = count === steps.length;
    return (
      <ResultHero
        earned={count}
        max={steps.length}
        showScore={false}
        title={all ? 'WebQuest voltooid! 🧭' : 'Tijd is om ⏰'}
        subtitle={`Je rondde ${count} van de ${steps.length} ${steps.length === 1 ? 'stap' : 'stappen'} af.`}
      />
    );
  }

  const step = steps[active];
  const doneCount = steps.filter((s) => done.has(s.id)).length;
  const isDoneStep = done.has(step.id);
  const links = step.links.filter((l) => l.url.trim());
  const paras = toParagraphs(step.content);

  const completeStep = () => {
    if (done.has(step.id)) return;
    const next = new Set(done);
    next.add(step.id);
    setDone(next);
    if (next.size >= steps.length) {
      submit(next);
      return;
    }
    // Ga naar de eerstvolgende stap die nog niet afgerond is.
    let target = steps.findIndex((s, j) => j > active && !next.has(s.id));
    if (target === -1) target = steps.findIndex((s) => !next.has(s.id));
    if (target !== -1) setActive(target);
    window.scrollTo({ top: 0 });
  };

  const stepButton = (s: WebquestStep, i: number) => {
    const isDone = done.has(s.id);
    const isActive = i === active;
    if (narrow) {
      return (
        <button
          key={s.id}
          className={`chip ${isActive ? 'placed' : ''}`}
          style={{ flex: 'none' }}
          aria-current={isActive ? 'step' : undefined}
          aria-label={`${stepTitle(s, i)}${isDone ? ' (afgerond)' : ''}`}
          onClick={() => setActive(i)}
        >
          <span aria-hidden>{isDone ? '✓' : `${i + 1}.`}</span> {stepTitle(s, i)}
        </button>
      );
    }
    return (
      <button
        key={s.id}
        className={`answer-option ${isActive ? 'selected' : ''} ${isDone ? 'correct' : ''}`}
        style={{ marginBottom: 8, padding: '10px 12px' }}
        aria-current={isActive ? 'step' : undefined}
        onClick={() => setActive(i)}
      >
        <span className="marker" aria-hidden>{isDone ? '✓' : i + 1}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stepTitle(s, i)}
        </span>
        {isDone && <span className="sr-only">(afgerond)</span>}
      </button>
    );
  };

  const mainPanel = (
    <section className="card question-card" style={{ marginBottom: 0 }} aria-label={`Stap ${active + 1}: ${stepTitle(step, active)}`}>
      <div className="question-num">
        Stap {active + 1} van {steps.length}
        {isDoneStep && <span className="badge badge-ok">✓ Afgerond</span>}
      </div>
      <h2 style={{ marginBottom: 12 }}>{stepTitle(step, active)}</h2>
      {step.imageUrl && <img src={step.imageUrl} alt="" className="question-image" />}
      {paras.length === 0 ? (
        <p style={{ color: 'var(--text-faint)' }}>Geen extra uitleg bij deze stap.</p>
      ) : (
        paras.map((p, i) => (
          <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>
        ))
      )}
      {links.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-soft)' }}>
            🔗 Links bij deze stap
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {links.map((l, i) => (
              <a
                key={i}
                className="btn btn-ghost btn-sm"
                href={ensureHttp(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${l.label.trim() || l.url} openen in een nieuw tabblad`}
              >
                🌐 {l.label.trim() || l.url} <span aria-hidden>↗</span>
              </a>
            ))}
          </div>
          <p className="hint" style={{ margin: '8px 0 0', color: 'var(--text-faint)', fontSize: '0.82rem' }}>
            Links openen in een nieuw tabblad — dit venster blijft gewoon open.
          </p>
        </div>
      )}
      <div className="player-nav">
        <button
          className="btn btn-ghost"
          disabled={active === 0}
          aria-label="Naar de vorige stap"
          onClick={() => setActive(active - 1)}
        >
          ← Vorige
        </button>
        {!isDoneStep ? (
          <button
            className="btn btn-primary"
            aria-label={`Stap ${active + 1} afronden`}
            onClick={completeStep}
          >
            Stap afronden ✓
          </button>
        ) : active < steps.length - 1 ? (
          <button className="btn btn-ghost" aria-label="Naar de volgende stap" onClick={() => setActive(active + 1)}>
            Volgende →
          </button>
        ) : (
          <span className="badge badge-ok">Deze stap is afgerond</span>
        )}
      </div>
    </section>
  );

  return (
    <div>
      {/* Voortgang bovenaan */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
            marginBottom: 6, fontWeight: 650, color: 'var(--text-soft)', fontSize: '0.92rem',
          }}
        >
          <span>🧭 WebQuest</span>
          <span role="status" aria-live="polite">
            {doneCount} van {steps.length} {steps.length === 1 ? 'stap' : 'stappen'} afgerond
          </span>
        </div>
        <div
          className="progressbar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-label="Voortgang van de webquest"
        >
          <div style={{ width: `${pct(doneCount, steps.length)}%` }} />
        </div>
      </div>

      {narrow ? (
        <div>
          <nav
            aria-label="Stappen van de webquest"
            style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}
          >
            {steps.map(stepButton)}
          </nav>
          {mainPanel}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <nav aria-label="Stappen van de webquest">
            {steps.map(stepButton)}
          </nav>
          {mainPanel}
        </div>
      )}
    </div>
  );
}
