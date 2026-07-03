import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { formatDate, pct } from '../lib/utils';
import { EmptyState } from '../components/ui';
import { gradeQuestion } from '../lib/grading';
import type { Question, QuizConfig, Submission, Widget } from '../lib/types';

// widgets met een QuizConfig-achtige 'questions'-lijst (zelfde set als ResultsPage)
const QUIZ_FAMILY = new Set<string>(['quiz', 'worksheet', 'exitticket', 'splitworksheet']);

export function ResultsOverviewPage() {
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);

  const widgets = getWidgets().filter((w) => getTypeDef(w.type).hasSubmissions);
  const withSubs = widgets
    .map((w) => ({ widget: w, subs: getSubmissions(w.id) }))
    .filter((x) => x.subs.length > 0)
    .sort((a, b) => Math.max(...b.subs.map((s) => s.submittedAt)) - Math.max(...a.subs.map((s) => s.submittedAt)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resultaten</h1>
          <p className="sub">Alle inzendingen van je leerlingen, per widget.</p>
        </div>
      </div>

      {withSubs.length === 0 ? (
        <EmptyState icon="📊" title="Nog geen inzendingen">
          <p>Deel een widget met je klas via de code of link — de resultaten verschijnen hier automatisch.</p>
          <Link to="/widgets" className="btn btn-primary">Naar mijn widgets</Link>
        </EmptyState>
      ) : (
        <>
          <CrossWidgetGoals items={withSubs} />
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Widget</th>
                  <th>Inzendingen</th>
                  <th>Gemiddelde score</th>
                  <th>Te beoordelen</th>
                  <th>Laatste inzending</th>
                </tr>
              </thead>
              <tbody>
                {withSubs.map(({ widget, subs }) => {
                  const def = getTypeDef(widget.type);
                  const scored = subs.filter((s) => s.totalMax > 0);
                  const avg = scored.length > 0
                    ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length)
                    : null;
                  const pending = subs.filter((s) => s.status === 'submitted').length;
                  const last = Math.max(...subs.map((s) => s.submittedAt));
                  return (
                    <tr key={widget.id} onClick={() => (location.hash = `#/resultaten/${widget.id}`)}>
                      <td>
                        <strong>{def.icon} {widget.title}</strong>
                        <div className="hint">{def.name} · code {widget.code}</div>
                      </td>
                      <td>{subs.length}</td>
                      <td>
                        {avg === null ? <span className="hint">—</span> : (
                          <div className="scorebar">
                            <div className="bar"><div style={{ width: `${avg}%`, background: avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }} /></div>
                            <strong>{avg}%</strong>
                          </div>
                        )}
                      </td>
                      <td>{pending > 0 ? <span className="badge badge-warn">✍️ {pending}</span> : <span className="badge badge-ok">✓ klaar</span>}</td>
                      <td className="hint">{formatDate(last)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Leerdoelen over widgets heen ────────────────────────────────────────────

interface GoalAgg {
  earned: number;
  max: number;
  /** Widgets die (met beoordeelde antwoorden) aan dit doel bijdragen. */
  widgetIds: Set<string>;
  /** Inzendingen die (met beoordeelde antwoorden) aan dit doel bijdragen. */
  subIds: Set<string>;
}

interface StudentRow {
  /** Meest recente schrijfwijze van de naam. */
  name: string;
  /** Tijdstip van de recentste inzending (om de schrijfwijze te kiezen). */
  last: number;
  perGoal: Map<string, { earned: number; max: number }>;
}

/**
 * Aggregatie van leerdoel-tags (q.goal) over alle quiz-achtige widgets heen:
 * totale beheersing per doel + uitklapbare heatmap leerlingen × doelen.
 */
function CrossWidgetGoals({ items }: { items: { widget: Widget; subs: Submission[] }[] }) {
  const goals = new Map<string, GoalAgg>();
  const students = new Map<string, StudentRow>();

  for (const { widget, subs } of items) {
    if (!QUIZ_FAMILY.has(widget.type)) continue;
    const questions = (widget.config as Partial<QuizConfig>).questions ?? [];
    const tagged = questions
      .filter((q): q is Question => !!q && q.type !== 'info')
      .map((q) => ({ q, goal: (q.goal ?? '').trim() }))
      .filter((t) => t.goal !== '');
    if (tagged.length === 0) continue;

    for (const s of subs) {
      for (const { q, goal } of tagged) {
        // vragenpool-conventie (zoals ResultsPage): de vraag zit alleen in de
        // inzending als itemScores null is óf de vraag-id als sleutel heeft
        if (s.itemScores && !(q.id in s.itemScores)) continue;

        let agg = goals.get(goal);
        if (!agg) {
          agg = { earned: 0, max: 0, widgetIds: new Set(), subIds: new Set() };
          goals.set(goal, agg);
        }

        const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
        if (sc.mode === 'pending') continue; // nog niet beoordeeld → telt niet mee
        agg.earned += sc.earned;
        agg.max += sc.max;
        agg.widgetIds.add(widget.id);
        agg.subIds.add(s.id);

        const rawName = s.studentName.trim() || 'Anoniem';
        const key = rawName.toLowerCase();
        let st = students.get(key);
        if (!st) {
          st = { name: rawName, last: s.submittedAt, perGoal: new Map() };
          students.set(key, st);
        }
        if (s.submittedAt >= st.last) {
          st.last = s.submittedAt;
          st.name = rawName;
        }
        const pg = st.perGoal.get(goal) ?? { earned: 0, max: 0 };
        pg.earned += sc.earned;
        pg.max += sc.max;
        st.perGoal.set(goal, pg);
      }
    }
  }

  // alleen tonen als er minstens één doel-tag met inzendingen bestaat
  if (goals.size === 0) return null;

  const goalNames = [...goals.keys()].sort((a, b) => a.localeCompare(b, 'nl'));
  const studentRows = [...students.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'nl'));

  const cellColor = (p: number | null) =>
    p === null ? 'var(--bg-sunken)' : p >= 70 ? 'var(--ok-soft)' : p >= 45 ? 'var(--warn-soft)' : 'var(--err-soft)';
  const cellText = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';
  const barColor = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';

  return (
    <details className="card card-pad" open style={{ marginBottom: 18 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem' }}>
        🎯 Leerdoelen over widgets heen
      </summary>
      <p className="hint" style={{ margin: '8px 0 14px' }}>
        Dit zijn <strong>indicaties</strong>, samengeteld over alle widgets waarvan vragen dit leerdoel dragen.
        Nog niet beoordeelde antwoorden tellen niet mee. Gebruik ze als startpunt voor een gesprek, niet als eindoordeel.
      </p>

      {goalNames.map((goal) => {
        const agg = goals.get(goal)!;
        const p = agg.max > 0 ? pct(agg.earned, agg.max) : null;
        return (
          <div key={goal} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontWeight: 600, marginBottom: 3 }}>
              <span>{goal}</span>
              <span style={{ color: cellText(p) }}>{p === null ? '— nog te beoordelen' : `${p}%`}</span>
            </div>
            <div
              className="progressbar"
              role="img"
              aria-label={p === null
                ? `Leerdoel ${goal}: nog geen beoordeelde antwoorden`
                : `Leerdoel ${goal}: ${p} procent beheersing`}
            >
              <div style={{ width: `${p ?? 0}%`, background: barColor(p) }} />
            </div>
            <div className="hint" style={{ marginTop: 3 }}>
              gebaseerd op {agg.widgetIds.size} {agg.widgetIds.size === 1 ? 'widget' : 'widgets'} · {agg.subIds.size} {agg.subIds.size === 1 ? 'inzending' : 'inzendingen'}
            </div>
          </div>
        );
      })}

      {studentRows.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
            Heatmap per leerling (voor klassenraad of remediëring)
          </summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Leerling</th>
                  {goalNames.map((g) => <th key={g}>{g}</th>)}
                </tr>
              </thead>
              <tbody>
                {studentRows.map(([key, st]) => (
                  <tr key={key} style={{ cursor: 'default' }}>
                    <td><strong>{st.name}</strong></td>
                    {goalNames.map((g) => {
                      const pg = st.perGoal.get(g);
                      const p = pg && pg.max > 0 ? pct(pg.earned, pg.max) : null;
                      return (
                        <td key={g} style={{ background: cellColor(p), color: cellText(p), fontWeight: 700, textAlign: 'center' }}>
                          {p === null ? '—' : `${p}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </details>
  );
}
