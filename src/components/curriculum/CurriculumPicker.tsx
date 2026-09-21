// ── Leerplan + doelen kiezen ────────────────────────────────────────────────
//
// Herbruikbaar blok: eerst een leerplan kiezen, dan de doelen aanvinken
// (gegroepeerd per thema, met zoekveld en snelknoppen). De aanroeper krijgt
// zowel de codes als de volledige doelen terug — die codes reizen mee naar de
// secties, de vragen en de dekking.

import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Curriculum, CurriculumGoal } from '../../lib/curriculumTypes';
import {
  curriculumLabel, getCurricula, goalsByTheme, netLabel, normalizeGoalCode,
} from '../../lib/curriculum';

export interface CurriculumSelection {
  curriculumId?: string;
  /** Genormaliseerde codes van de aangevinkte doelen. */
  goalCodes: string[];
  /** Dezelfde doelen, volledig (voor prompts en voorvertoningen). */
  goals: CurriculumGoal[];
}

export function CurriculumPicker({
  curriculumId,
  goalCodes,
  onChange,
  compact = false,
}: {
  curriculumId?: string;
  goalCodes: string[];
  onChange: (selection: CurriculumSelection) => void;
  /** Kleinere lijst (in een modal naast andere velden). */
  compact?: boolean;
}): JSX.Element {
  const selectId = useId();
  const searchId = useId();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => setCurricula(getCurricula()), []);

  const current = curricula.find((c) => c.id === curriculumId);
  const selected = useMemo(() => new Set(goalCodes.map(normalizeGoalCode)), [goalCodes]);

  const emit = (cur: Curriculum | undefined, codes: string[]) => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of codes) {
      const code = normalizeGoalCode(raw);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      unique.push(code);
    }
    const goals = (cur?.goals ?? []).filter((g) => seen.has(normalizeGoalCode(g.code)));
    onChange({ curriculumId: cur?.id, goalCodes: unique, goals });
  };

  const pickCurriculum = (id: string) => {
    const cur = curricula.find((c) => c.id === id);
    emit(cur, []); // doelen van een ander leerplan slaan nergens op
  };

  const toggle = (goal: CurriculumGoal) => {
    const code = normalizeGoalCode(goal.code);
    emit(current, selected.has(code) ? goalCodes.filter((c) => normalizeGoalCode(c) !== code) : [...goalCodes, code]);
  };

  const groups = useMemo(() => goalsByTheme(current?.goals ?? []), [current]);
  const q = query.trim().toLowerCase();
  const matches = (g: CurriculumGoal) =>
    !q || g.code.toLowerCase().includes(q) || g.text.toLowerCase().includes(q) || (g.theme ?? '').toLowerCase().includes(q);

  const visible = groups
    .map((group) => ({ ...group, goals: group.goals.filter(matches) }))
    .filter((group) => group.goals.length > 0);
  const visibleGoals = visible.flatMap((g) => g.goals);

  if (curricula.length === 0) {
    return (
      <div className="callout">
        <strong>Nog geen leerplan op dit toestel</strong>
        <p style={{ margin: '4px 0 8px' }}>
          Maak eerst een doelenlijst aan: blanco, uit een geplakte leerplantekst of pdf, of uit een
          JSON-bestand van een collega.
        </p>
        <Link to="/leerplannen" className="btn btn-sm btn-primary">🎯 Naar Leerplannen</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="field">
        <label htmlFor={selectId}>Leerplan</label>
        <select
          id={selectId}
          className="select"
          value={curriculumId ?? ''}
          onChange={(e) => pickCurriculum(e.target.value)}
        >
          <option value="">— geen leerplan —</option>
          {curricula.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.example ? ' (voorbeeld)' : ''} — {curriculumLabel(c)}
            </option>
          ))}
        </select>
        {current && (
          <span className="hint">
            {netLabel(current.net)} · {current.goals.length} doelen
            {current.example ? ' · voorbeeldmateriaal, geen officieel document' : ''}
          </span>
        )}
      </div>

      {current && current.goals.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label htmlFor={searchId}>Zoeken in doelen</label>
              <input
                id={searchId}
                className="input input-sm"
                value={query}
                placeholder="code, woord of thema"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => emit(current, current.goals.map((g) => g.code))}>
                Alles
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => emit(current, current.goals.filter((g) => g.level !== 'uitbreiding').map((g) => g.code))}
              >
                Alleen basis
              </button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={goalCodes.length === 0} onClick={() => emit(current, [])}>
                Niets
              </button>
            </div>
          </div>

          <p className="hint" aria-live="polite" style={{ margin: '0 0 6px' }}>
            {selected.size} van {current.goals.length} doelen gekozen
            {q ? ` · ${visibleGoals.length} zichtbaar door de zoekterm` : ''}
          </p>

          <div
            style={{
              maxHeight: compact ? 260 : 420, overflowY: 'auto', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-m)', padding: '8px 12px',
            }}
          >
            {visible.length === 0 && <p className="hint" style={{ margin: 6 }}>Geen doelen gevonden voor “{query}”.</p>}
            {visible.map((group) => {
              const codes = group.goals.map((g) => normalizeGoalCode(g.code));
              const allOn = codes.every((c) => selected.has(c));
              return (
                <fieldset key={group.theme || '—'} style={{ border: 'none', margin: '0 0 10px', padding: 0 }}>
                  <legend style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, fontWeight: 700, fontSize: '0.92rem' }}>
                    <span>{group.theme || 'Zonder thema'}</span>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() =>
                        emit(
                          current,
                          allOn
                            ? goalCodes.filter((c) => !codes.includes(normalizeGoalCode(c)))
                            : [...goalCodes, ...codes]
                        )
                      }
                    >
                      {allOn ? 'thema uitvinken' : 'heel thema'}
                    </button>
                  </legend>
                  {group.goals.map((goal) => {
                    const code = normalizeGoalCode(goal.code);
                    return (
                      <label key={goal.id} className="checkbox-row" style={{ alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(code)}
                          onChange={() => toggle(goal)}
                        />
                        <span style={{ fontSize: '0.88rem', lineHeight: 1.35 }}>
                          <strong style={{ fontFamily: 'monospace' }}>{code}</strong>{' '}
                          {goal.text}
                          {goal.level === 'uitbreiding' && (
                            <span className="badge badge-warn" style={{ marginLeft: 6 }}>uitbreiding</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
          </div>
        </>
      )}

      {current && current.goals.length === 0 && (
        <p className="hint">
          Dit leerplan bevat nog geen doelen. Vul het aan via <Link to="/leerplannen">Leerplannen</Link>.
        </p>
      )}
    </div>
  );
}
