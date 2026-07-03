import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Course, CourseProgress } from '../lib/courseTypes';
import { allSections, countableSections, progressPercent, referencedWidgetIds } from '../lib/courseTypes';
import {
  decodeCourseProgress, deleteStudentProgress, getCourse, getCourseProgressAll, importProgressCode,
} from '../lib/courses';
import { getSubmissions, getWidget, onStorageChange } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { csvCell, downloadFile, formatDate, formatDuration, pct } from '../lib/utils';
import { ConfirmModal, EmptyState, Modal, useToast } from '../components/ui';

export function CourseTrackPage() {
  const { id } = useParams();
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  const course = useMemo(() => (id ? getCourse(id) : undefined), [id, tick]);
  const progress = useMemo(
    () => (course ? [...getCourseProgressAll(course.id)].sort((a, b) => a.studentName.localeCompare(b.studentName, 'nl')) : []),
    [course, tick]
  );
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseProgress | null>(null);
  const toast = useToast();

  if (!course) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 60 }}>
        <EmptyState icon="📊" title="Cursus niet gevonden">
          <Link to="/cursussen" className="btn btn-primary">← Naar de cursussen</Link>
        </EmptyState>
      </div>
    );
  }

  const sections = allSections(course);
  const countable = countableSections(course);
  const avg = progress.length
    ? Math.round(progress.reduce((a, p) => a + progressPercent(course, p), 0) / progress.length)
    : 0;
  const complete = progress.filter((p) => progressPercent(course, p) === 100).length;
  const totalSeconds = progress.reduce(
    (a, p) => a + Object.values(p.sections).reduce((x, s) => x + (s.secondsSpent || 0), 0),
    0
  );

  const exportCsv = () => {
    const head = ['naam', 'voortgang %', 'laatst gezien', ...sections.map(({ chapter, section }) => `${chapter.title} › ${section.title}${section.optional ? ' (keuze)' : ''}`)];
    const lines = [head.map(csvCell).join(';')];
    for (const p of progress) {
      lines.push(
        [
          p.studentName,
          progressPercent(course, p),
          formatDate(p.lastSeenAt),
          ...sections.map(({ section }) => {
            const sp = p.sections[section.id];
            return sp?.completedAt ? 'gelezen' : sp ? 'geopend' : '-';
          }),
        ].map(csvCell).join(';')
      );
    }
    downloadFile(`voortgang - ${course.title}.csv`, lines.join('\n'), 'text/csv');
  };

  const widgets = referencedWidgetIds(course)
    .map((wid) => getWidget(wid))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📊 {course.title}</h1>
          <p className="sub">Leesvoortgang per leerling en per sectie — transparant: de leerling ziet zelf exact hetzelfde.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={progress.length === 0}>⬇ CSV</button>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>📨 Voortgangscodes invoeren</button>
          <Link to={`/cursus/bewerk/${course.id}`} className="btn btn-primary">✏️ Bewerken</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 20 }}>
        {[
          { icon: '👥', label: 'lezers', value: String(progress.length) },
          { icon: '📈', label: 'gemiddelde voortgang', value: `${avg}%` },
          { icon: '🎉', label: 'volledig afgewerkt', value: String(complete) },
          { icon: '⏱️', label: 'totale leestijd', value: formatDuration(totalSeconds) },
        ].map((s) => (
          <div key={s.label} className="card card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem' }} aria-hidden>{s.icon}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{s.value}</div>
            <div className="hint">{s.label}</div>
          </div>
        ))}
      </div>

      {progress.length === 0 ? (
        <EmptyState icon="🕐" title="Nog geen lezers">
          <p>
            Zodra leerlingen op dit toestel (of via de klascode in deze browser) lezen, verschijnt hun
            voortgang hier. Lezen ze thuis via de draagbare link? Laat hen dan hun
            <strong> voortgangscode</strong> doorsturen en voer die hierboven in.
          </p>
        </EmptyState>
      ) : (
        <>
          <div className="card" style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table className="data" style={{ minWidth: 640, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', zIndex: 1, textAlign: 'left', padding: '8px 12px' }}>
                    Leerling
                  </th>
                  {course.chapters.map((ch) => (
                    <th key={ch.id} colSpan={ch.sections.length} style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', fontSize: '0.82rem' }}>
                      {ch.emoji} {ch.title}
                    </th>
                  ))}
                  <th rowSpan={2} style={{ padding: '6px 10px' }}>%</th>
                  <th rowSpan={2} style={{ padding: '6px 10px' }}>Laatst gezien</th>
                  <th rowSpan={2} aria-label="Acties" />
                </tr>
                <tr>
                  {sections.map(({ section }) => (
                    <th
                      key={section.id}
                      title={`${section.title}${section.optional ? ' (keuzesectie)' : ''}`}
                      style={{ padding: '4px 6px', fontSize: '0.75rem', fontWeight: 500, color: section.optional ? 'var(--text-faint)' : 'var(--text-soft)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {section.title}{section.optional ? ' ◇' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.studentName} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-raised)', fontWeight: 600, padding: '7px 12px', whiteSpace: 'nowrap' }}>
                      {p.studentName}
                    </td>
                    {sections.map(({ section }) => {
                      const sp = p.sections[section.id];
                      const state = sp?.completedAt ? 'done' : sp ? 'open' : 'none';
                      return (
                        <td key={section.id} style={{ textAlign: 'center', padding: '6px 4px' }}
                          title={
                            state === 'done'
                              ? `Gelezen op ${formatDate(sp!.completedAt!)} · leestijd ${formatDuration(sp!.secondsSpent)}`
                              : state === 'open'
                                ? `Geopend · leestijd ${formatDuration(sp!.secondsSpent)}`
                                : 'Nog niet geopend'
                          }
                        >
                          <span aria-label={state === 'done' ? 'gelezen' : state === 'open' ? 'geopend' : 'nog niet geopend'}>
                            {state === 'done' ? '✅' : state === 'open' ? '◐' : '·'}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 700, padding: '6px 10px' }}>{progressPercent(course, p)}%</td>
                    <td style={{ whiteSpace: 'nowrap', padding: '6px 10px' }} className="hint">{formatDate(p.lastSeenAt)}</td>
                    <td style={{ padding: '4px 6px' }}>
                      <button
                        className="btn btn-sm btn-quiet btn-icon"
                        aria-label={`Voortgang van ${p.studentName} verwijderen`}
                        title="Voortgang verwijderen"
                        onClick={() => setDeleteTarget(p)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Waar zit de klas? (per sectie)</h3>
            <p className="hint" style={{ marginTop: -6 }}>
              Leestijd is context, geen oordeel — snel lezen kan grondig zijn, traag lezen zorgvuldig.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {sections.map(({ chapter, section }) => {
                const done = progress.filter((p) => p.sections[section.id]?.completedAt).length;
                const opened = progress.filter((p) => p.sections[section.id]).length;
                const pctDone = progress.length ? Math.round((done / progress.length) * 100) : 0;
                const times = progress.map((p) => p.sections[section.id]?.secondsSpent ?? 0).filter((t) => t > 0);
                const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
                return (
                  <div key={section.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 300px) 1fr auto', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${chapter.title} › ${section.title}`}>
                      {section.title}{section.optional && <span className="hint"> ◇ keuze</span>}
                    </span>
                    <div style={{ background: 'var(--bg-sunken)', borderRadius: 99, height: 14, overflow: 'hidden' }}
                      role="img" aria-label={`${done} van ${progress.length} leerlingen lazen "${section.title}"`}>
                      <div style={{ width: `${pctDone}%`, height: '100%', background: 'var(--ok)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                      {done}✅ / {opened}◐{avgTime > 0 && ` (gem. ${formatDuration(avgTime)})`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {widgets.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>🧩 Oefeningen in deze cursus</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {widgets.map((w) => {
              const subs = getSubmissions(w.id);
              const scored = subs.filter((s) => s.totalMax > 0);
              const avgScore = scored.length
                ? Math.round(scored.reduce((a, s) => a + pct(s.totalEarned, s.totalMax), 0) / scored.length)
                : null;
              const def = getTypeDef(w.type);
              return (
                <div key={w.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span aria-hidden>{def.icon}</span>
                  <strong style={{ flex: '1 1 200px' }}>{w.title}</strong>
                  <span className="hint">{subs.length} inzending{subs.length === 1 ? '' : 'en'}{avgScore !== null && ` · gem. ${avgScore}%`}</span>
                  {def.hasSubmissions && <Link to={`/resultaten/${w.id}`} className="btn btn-sm btn-ghost">→ Resultaten</Link>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="hint">
        🔎 Eerlijk over de werking: voortgang wordt per toestel/browser bijgehouden. Leerlingen die
        thuis via de draagbare link lezen, sturen hun <strong>voortgangscode</strong> door (die vinden
        ze in de cursus zelf). Er is geen verborgen tracking — de leerling ziet exact wat jij ziet.
      </p>

      {importOpen && (
        <ProgressImportModal
          course={course}
          onClose={() => setImportOpen(false)}
          onDone={(report) => toast(report, report.includes('ingevoerd') ? 'ok' : 'err')}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Voortgang verwijderen?"
          message={`De leesvoortgang van ${deleteTarget.studentName} voor deze cursus wordt definitief verwijderd.`}
          onConfirm={() => deleteStudentProgress(course.id, deleteTarget.studentName)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ProgressImportModal({
  course, onClose, onDone,
}: { course: Course; onClose: () => void; onDone: (report: string) => void }) {
  const [text, setText] = useState('');

  const doImport = () => {
    const codes = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    let ok = 0;
    let invalid = 0;
    let other = 0;
    for (const code of codes) {
      const p = decodeCourseProgress(code);
      if (!p) { invalid++; continue; }
      if (p.courseId !== course.id && p.courseCode !== course.code) { other++; continue; }
      importProgressCode(p);
      ok++;
    }
    const parts = [`${ok} ingevoerd`];
    if (invalid) parts.push(`${invalid} ongeldig`);
    if (other) parts.push(`${other} hoorde bij een andere cursus`);
    onDone(parts.join(', '));
    onClose();
  };

  return (
    <Modal
      title="📨 Voortgangscodes invoeren"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={doImport}>Invoeren</button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Leerlingen die thuis lazen, vinden hun voortgangscode (begint met <code>WFC1.</code>) in de
        cursus. Plak hier één of meerdere codes — gescheiden door spaties of nieuwe regels.
      </p>
      <textarea
        className="textarea" rows={6} value={text} autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder="WFC1.…"
        aria-label="Voortgangscodes"
      />
    </Modal>
  );
}
