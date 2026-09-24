// ── Invoerveld voor leerplandoelcodes ───────────────────────────────────────
//
// Eén of meer codes (bv. "NW 4.1") invoeren met autocomplete uit de
// leerplannen op dit toestel. Elke gekozen code wordt een chip met de code én
// het begin van de doeltekst, zodat je ziet wát je koppelt. Volledig met het
// toetsenbord te bedienen: typen + Enter voegt toe, Backspace in een leeg veld
// haalt de laatste chip weg, elke chip heeft een eigen verwijderknop.

import React, { useId, useMemo, useState } from 'react';
import { allGoalOptions, findGoalByCode, normalizeGoalCode, shortGoalText } from '../../lib/curriculum';
import { DeleteIcon } from '../icons';

export function GoalCodeInput({
  value,
  onChange,
  curriculumId,
  label = 'Leerplandoelen (codes)',
  hint = 'Typ een code of kies uit de lijst. De code koppelt deze sectie aan je leerplan, de dekking en het klasoverzicht.',
  placeholder = 'bv. NW 4.1',
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  /** Beperkt de suggesties tot één leerplan (aanbevolen). */
  curriculumId?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
}): JSX.Element {
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState('');
  const options = useMemo(() => allGoalOptions(curriculumId), [curriculumId]);

  const add = (raw: string) => {
    const code = normalizeGoalCode(raw);
    if (!code) return;
    if (!value.includes(code)) onChange([...value, code]);
    setDraft('');
  };

  const remove = (code: string) => onChange(value.filter((c) => c !== code));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      remove(value[value.length - 1]);
    }
  };

  const free = options.filter((o) => !value.includes(normalizeGoalCode(o.goal.code)));

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>

      {value.length > 0 && (
        <ul
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: '0 0 6px', padding: 0 }}
          aria-label="Gekoppelde leerplandoelen"
        >
          {value.map((code) => {
            const hit = findGoalByCode(code, curriculumId);
            return (
              <li
                key={code}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                  background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                  borderRadius: 999, padding: '3px 4px 3px 10px', fontSize: '0.84rem',
                }}
                title={hit ? `${hit.goal.code} — ${hit.goal.text}` : `${code} — niet gevonden in een leerplan op dit toestel`}
              >
                <strong style={{ fontFamily: 'monospace' }}>{code}</strong>
                <span
                  style={{ color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
                >
                  {hit ? shortGoalText(hit.goal.text, 48) : 'onbekende code'}
                </span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm btn-icon goalcode-chip-remove"
                  style={{ minWidth: 26, minHeight: 26, padding: 0, borderRadius: 999 }}
                  aria-label={`Doel ${code} loskoppelen`}
                  onClick={() => remove(code)}
                >
                  <DeleteIcon size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id={inputId}
          className="input input-sm"
          style={{ flex: 1, minWidth: 140 }}
          list={listId}
          value={draft}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            // Kiezen uit de datalist levert de volledige waarde in één keer:
            // meteen als chip toevoegen voelt natuurlijker dan nog eens Enter.
            if (options.some((o) => normalizeGoalCode(o.goal.code) === normalizeGoalCode(v))) add(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
        />
        <datalist id={listId}>
          {free.map((o) => (
            <option key={`${o.curriculumId}-${o.goal.id}`} value={normalizeGoalCode(o.goal.code)}>
              {shortGoalText(o.goal.text, 70)}
            </option>
          ))}
        </datalist>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!draft.trim()} onClick={() => add(draft)}>
          + Toevoegen
        </button>
      </div>

      <span className="hint">
        {hint}
        {options.length === 0 && ' Er staat nog geen leerplan op dit toestel — maak er een via “Leerplannen”.'}
      </span>
    </div>
  );
}
