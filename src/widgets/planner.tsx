import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerConfig, PlannerSection } from '../lib/types';
import { uid } from '../lib/utils';
import { Field } from '../components/ui';
import { EditorProps, GameStatus, ItemHeader, moveItem, PlayerProps, ResultHero } from './shared';

// ── Editor ──────────────────────────────────────────────────────────────────

export function PlannerEditor({ config, onChange }: EditorProps<PlannerConfig>) {
  const sections = config.sections ?? [];

  const update = (i: number, sec: PlannerSection) => {
    const next = sections.slice();
    next[i] = sec;
    onChange({ ...config, sections: next });
  };

  const duplicate = (i: number) => {
    const src = sections[i];
    const copy: PlannerSection = {
      id: uid(),
      title: src.title.trim() ? `${src.title} (kopie)` : '',
      tasks: src.tasks.map((t) => ({ id: uid(), text: t.text })),
    };
    const next = sections.slice();
    next.splice(i + 1, 0, copy);
    onChange({ ...config, sections: next });
  };

  return (
    <div>
      <Field label="Titel van de planning">
        <input
          className="input"
          value={config.title ?? ''}
          placeholder="bv. Weekplanning werkstuk"
          onChange={(e) => onChange({ ...config, title: e.target.value })}
        />
      </Field>
      <p className="hint" style={{ marginBottom: 12 }}>
        Verdeel het werk in secties (bv. dagen of fasen). De leerling vinkt per sectie de taken af.
      </p>
      {sections.length === 0 && (
        <p style={{ color: 'var(--text-soft)', marginBottom: 12 }}>
          Nog geen secties — voeg er hieronder één toe.
        </p>
      )}
      {sections.map((sec, i) => (
        <div className="editor-item" key={sec.id}>
          <ItemHeader
            index={i}
            label={sec.title.trim() || 'Nieuwe sectie'}
            canUp={i > 0}
            canDown={i < sections.length - 1}
            onMoveUp={() => onChange({ ...config, sections: moveItem(sections, i, i - 1) })}
            onMoveDown={() => onChange({ ...config, sections: moveItem(sections, i, i + 1) })}
            onDelete={() => onChange({ ...config, sections: sections.filter((_, j) => j !== i) })}
            onDuplicate={() => duplicate(i)}
          />
          <div className="editor-item-body">
            <Field label="Sectietitel">
              <input
                className="input input-sm"
                value={sec.title}
                placeholder="bv. Maandag of Fase 1: onderzoek"
                onChange={(e) => update(i, { ...sec, title: e.target.value })}
              />
            </Field>
            <Field label="Taken" hint="Eén taak per regel.">
              <textarea
                className="textarea"
                rows={4}
                value={sec.tasks.map((t) => t.text).join('\n')}
                onChange={(e) =>
                  update(i, {
                    ...sec,
                    tasks: e.target.value.split('\n').map((text, j) => ({ id: sec.tasks[j]?.id ?? uid(), text })),
                  })
                }
              />
            </Field>
          </div>
        </div>
      ))}
      <button
        className="btn btn-primary"
        onClick={() => onChange({ ...config, sections: [...sections, { id: uid(), title: '', tasks: [] }] })}
      >
        + Sectie toevoegen
      </button>
    </div>
  );
}

// ── Speler ──────────────────────────────────────────────────────────────────

export function PlannerPlayer({ widget, timeUp, onComplete }: PlayerProps<PlannerConfig>) {
  const sections = useMemo(
    () =>
      (widget.config.sections ?? [])
        .map((s) => ({ ...s, tasks: (s.tasks ?? []).filter((t) => t.text.trim()) }))
        .filter((s) => s.tasks.length > 0),
    [widget.id]
  );
  const totalTasks = sections.reduce((n, s) => n + s.tasks.length, 0);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const submittedRef = useRef(false);

  const sectionLabel = (sec: PlannerSection, i: number) => (sec.title ?? '').trim() || `Sectie ${i + 1}`;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const perSectie: Record<string, string[]> = {};
    sections.forEach((sec, i) => {
      let key = sectionLabel(sec, i);
      if (key in perSectie) key = `${key} (${i + 1})`;
      perSectie[key] = sec.tasks.filter((t) => checked.has(t.id)).map((t) => t.text);
    });
    setDone(true);
    onComplete({
      answers: { perSectie },
      itemScores: null,
      earned: checked.size,
      max: totalTasks,
    });
  };

  // Tijd om: meteen de huidige stand indienen.
  useEffect(() => {
    if (timeUp && !submittedRef.current && totalTasks > 0) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (totalTasks === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>Nog geen taken ingesteld.</p>;
  }

  if (done) {
    return (
      <ResultHero
        earned={checked.size}
        max={totalTasks}
        showScore={widget.settings.showScore}
        title="Planning ingediend! 🗓️"
        subtitle={`Je vinkte ${checked.size} van de ${totalTasks} taken af.`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
          {sections.map((sec, i) => {
            const nChecked = sec.tasks.filter((t) => checked.has(t.id)).length;
            return (
              <span key={sec.id} className={`badge ${nChecked === sec.tasks.length ? 'badge-ok' : ''}`}>
                {sectionLabel(sec, i)}: {nChecked}/{sec.tasks.length}
              </span>
            );
          })}
        </div>
      </ResultHero>
    );
  }

  const toggle = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div>
      {(widget.config.title ?? '').trim() !== '' && <h2 style={{ textAlign: 'center' }}>{widget.config.title}</h2>}

      <div style={{ maxWidth: 560, margin: '0 auto 8px' }}>
        <div
          className="progressbar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalTasks}
          aria-valuenow={checked.size}
          aria-label={`Totale voortgang: ${checked.size} van ${totalTasks} taken afgevinkt`}
        >
          <div style={{ width: `${(checked.size / totalTasks) * 100}%` }} />
        </div>
      </div>
      <GameStatus>
        <span>
          <strong style={{ color: 'var(--player-accent, var(--brand))' }}>{checked.size}</strong> van {totalTasks} taken afgevinkt
        </span>
        {checked.size === totalTasks && <span className="badge badge-ok">✓ Alles klaar!</span>}
      </GameStatus>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', alignItems: 'start' }}>
        {sections.map((sec, i) => {
          const nChecked = sec.tasks.filter((t) => checked.has(t.id)).length;
          const label = sectionLabel(sec, i);
          return (
            <section key={sec.id} className="card" style={{ padding: '15px 17px' }} aria-label={label}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <h3 style={{ margin: 0, flex: 1, minWidth: 0 }}>{label}</h3>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                  {nChecked}/{sec.tasks.length}
                </span>
              </div>
              <div
                className="progressbar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={sec.tasks.length}
                aria-valuenow={nChecked}
                aria-label={`Voortgang ${label}: ${nChecked} van ${sec.tasks.length} taken`}
                style={{ marginBottom: 10 }}
              >
                <div style={{ width: `${(nChecked / sec.tasks.length) * 100}%` }} />
              </div>
              <div>
                {sec.tasks.map((task) => {
                  const isChecked = checked.has(task.id);
                  return (
                    <label
                      key={task.id}
                      className="checkbox-row"
                      style={{
                        alignItems: 'flex-start',
                        textDecoration: isChecked ? 'line-through' : 'none',
                        opacity: isChecked ? 0.65 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        style={{ marginTop: 3, accentColor: 'var(--player-accent, var(--brand))' }}
                        onChange={(e) => toggle(task.id, e.target.checked)}
                      />
                      <span>{task.text}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="player-nav">
        <span style={{ fontWeight: 600, color: 'var(--text-soft)' }}>
          Klaar met je planning? Dien ze dan in.
        </span>
        <button className="btn btn-primary btn-lg" onClick={submit}>
          Planning indienen ✓
        </button>
      </div>
    </div>
  );
}
