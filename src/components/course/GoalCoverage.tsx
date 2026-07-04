import { useMemo, type CSSProperties } from 'react';
import type { Course, CourseChapter, CourseSection } from '../../lib/courseTypes';
import { EmptyState } from '../ui';

// ── Doelendekking ───────────────────────────────────────────────────────────
//
// Paneelinhoud (wordt door de editor in een brede Modal gezet) die in één
// oogopslag toont welke leerplandoelen waar gedekt zijn en welke secties
// nog geen doel dragen. Puur presentatie — er wordt niets opgeslagen.

interface GoalRow {
  /** Sleutel voor deduplicatie (getrimd + kleine letters). */
  key: string;
  /** Eerst geziene schrijfwijze — zo tonen we het doel. */
  label: string;
  /** Per hoofdstuk-id: de titels van de secties die dit doel dragen. */
  perChapter: Map<string, string[]>;
  /** Komt het doel in minstens één niet-optionele sectie voor? */
  inCore: boolean;
}

interface MissingGroup {
  chapter: CourseChapter;
  sections: CourseSection[];
}

function shortTitle(title: string, max = 14): string {
  const t = title.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function GoalCoverage({ course }: { course: Course }): JSX.Element {
  const { rows, sectionsWithGoal, totalSections, missing } = useMemo(() => {
    const byKey = new Map<string, GoalRow>();
    let withGoal = 0;
    let total = 0;
    const missingGroups: MissingGroup[] = [];

    for (const chapter of course.chapters) {
      const without: CourseSection[] = [];
      for (const section of chapter.sections) {
        total++;
        // Trimmen + per sectie hoofdletterongevoelig dedupliceren, zodat een
        // dubbel ingevoerd doel de telling niet opblaast.
        const seen = new Set<string>();
        const goals: string[] = [];
        for (const raw of section.goals ?? []) {
          const goal = raw.trim();
          const key = goal.toLowerCase();
          if (!goal || seen.has(key)) continue;
          seen.add(key);
          goals.push(goal);
        }
        if (goals.length === 0) {
          without.push(section);
          continue;
        }
        withGoal++;
        for (const goal of goals) {
          const key = goal.toLowerCase();
          let row = byKey.get(key);
          if (!row) {
            row = { key, label: goal, perChapter: new Map(), inCore: false };
            byKey.set(key, row);
          }
          const titles = row.perChapter.get(chapter.id) ?? [];
          titles.push(section.optional ? `${section.title} ◇` : section.title);
          row.perChapter.set(chapter.id, titles);
          if (!section.optional) row.inCore = true;
        }
      }
      if (without.length > 0) missingGroups.push({ chapter, sections: without });
    }
    return {
      rows: [...byKey.values()],
      sectionsWithGoal: withGoal,
      totalSections: total,
      missing: missingGroups,
    };
  }, [course]);

  // ── Lege staat: nog geen enkel doel in de cursus ──────────────────────────
  if (rows.length === 0) {
    return (
      <EmptyState icon="🎯" title="Nog geen leerplandoelen gekoppeld">
        <p>
          Koppel doelen aan je secties om hier de dekking te zien: welke doelen komen waar aan
          bod, en welke secties dragen er nog geen. Gekoppelde doelen voeden ook de heatmaps en
          de feed-up voor leerlingen.
        </p>
        <p className="hint">
          💡 Tip: de AI-cursusbouwer koppelt doelen automatisch aan de secties die hij maakt.
          Zelf doen kan ook — vul ze per sectie in via de linkerkolom van de editor.
        </p>
      </EmptyState>
    );
  }

  const sticky: CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--bg-raised)',
    zIndex: 1,
    textAlign: 'left',
    padding: '7px 12px',
  };

  return (
    <div>
      {/* 2. Samenvatting */}
      <p style={{ marginTop: 0 }}>
        <strong>{rows.length} {rows.length === 1 ? 'doel' : 'doelen'}</strong>
        {' · '}
        <strong>{sectionsWithGoal} van {totalSections}</strong> secties dragen een doel
        <span className="hint"> (keuzesecties tellen mee en zijn gemarkeerd met ◇)</span>
      </p>

      {/* 3. De matrix: doelen × hoofdstukken */}
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table className="data" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...sticky, minWidth: 220 }}>Doel</th>
              {course.chapters.map((ch) => (
                <th
                  key={ch.id}
                  scope="col"
                  title={ch.title}
                  style={{ padding: '7px 8px', fontSize: '0.82rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }}
                >
                  {ch.emoji ? `${ch.emoji} ` : ''}{shortTitle(ch.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={{ borderTop: '1px solid var(--line)' }}>
                <th scope="row" style={{ ...sticky, fontWeight: 600, fontSize: '0.88rem' }}>
                  {row.label}
                  {!row.inCore && (
                    <span
                      className="badge badge-warn"
                      style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                      title="Dit doel komt enkel voor in keuzesecties (verdieping) — geen enkele verplichte sectie dekt het."
                    >
                      ⚠️ alleen in verdieping
                    </span>
                  )}
                </th>
                {course.chapters.map((ch) => {
                  const titles = row.perChapter.get(ch.id) ?? [];
                  return (
                    <td
                      key={ch.id}
                      style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}
                      title={titles.length > 0 ? titles.join(' · ') : undefined}
                      aria-label={
                        titles.length > 0
                          ? `${titles.length} ${titles.length === 1 ? 'sectie draagt' : 'secties dragen'} dit doel in “${ch.title}”: ${titles.join(', ')}`
                          : `Geen secties met dit doel in “${ch.title}”`
                      }
                    >
                      {titles.length > 0 ? titles.length : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Secties zonder doel */}
      {missing.length === 0 ? (
        <p>
          <span aria-hidden>✅</span> Elke sectie draagt minstens één doel — de dekking is rond.
        </p>
      ) : (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Secties zonder doel</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Doelen koppelen loont: ze voeden de heatmaps én de feed-up (“wat leer je hier?”) voor
            je leerlingen.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {missing.map(({ chapter, sections }) => (
              <div key={chapter.id}>
                <strong style={{ fontSize: '0.92rem' }}>
                  {chapter.emoji ? `${chapter.emoji} ` : ''}{chapter.title}
                </strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
                  {sections.map((s) => (
                    <li key={s.id} style={{ fontSize: '0.9rem' }}>
                      {s.title}
                      {s.optional && <span className="hint"> ◇ keuzesectie</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Hint onderaan */}
      <p className="hint" style={{ marginBottom: 0 }}>
        💡 Doelen formuleer je best in leerlingtaal; dezelfde formulering in meerdere secties =
        dezelfde rij.
      </p>
    </div>
  );
}
