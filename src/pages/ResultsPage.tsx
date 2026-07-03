import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deleteSubmission, getLiveEntries, getSubmissions, getWidget, onStorageChange, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { LongAnswerValue, Question, QuizConfig, Submission, Widget } from '../lib/types';
import { csvCell, downloadFile, formatDate, formatDuration, pct } from '../lib/utils';
import { ConfirmModal, EmptyState, Modal, ScoreRing, useToast } from '../components/ui';
import { gradeQuestion } from '../lib/grading';
import { decodeSubmission } from '../lib/share';
import { uid } from '../lib/utils';

// widgets met een QuizConfig-achtige 'questions'-lijst → volledige beoordelings-UI
const QUIZ_FAMILY = new Set(['quiz', 'worksheet', 'exitticket', 'splitworksheet']);

export function ResultsPage() {
  const { id } = useParams();
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);

  const widget = id ? getWidget(id) : undefined;
  const [detail, setDetail] = useState<Submission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [tab, setTab] = useState<'students' | 'questions' | 'grade'>('students');
  const [importOpen, setImportOpen] = useState(false);
  const toast = useToast();

  if (!widget) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1>Widget niet gevonden</h1>
        <Link to="/resultaten" className="btn btn-primary">← Alle resultaten</Link>
      </div>
    );
  }

  const def = getTypeDef(widget.type);
  const subs = getSubmissions(widget.id).sort((a, b) => b.submittedAt - a.submittedAt);
  // live (zelfde toestel/browser): gestart maar nog niets ingediend sinds de start
  const busy = getLiveEntries(widget.id).filter(
    (e) => !subs.some((s) => s.studentName === e.studentName && s.submittedAt >= e.startedAt)
  );
  const scored = subs.filter((s) => s.totalMax > 0);
  const avg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length) : null;
  const isQuiz = QUIZ_FAMILY.has(widget.type);

  const exportCsv = (anonymous = false) => {
    const rows: string[][] = [];
    const nameOf = (s: Submission, i: number) => (anonymous ? `Leerling ${i + 1}` : s.studentName);
    if (isQuiz) {
      const qs = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Procent', ...qs.map((q, i) => `V${i + 1}: ${q.prompt.slice(0, 40)}`)]);
      subs.forEach((s, i) => {
        rows.push([
          nameOf(s, i), formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax), s.totalMax > 0 ? `${pct(s.totalEarned, s.totalMax)}%` : '',
          ...qs.map((q) => formatAnswer(q, s.answers[q.id])),
        ]);
      });
    } else {
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Details']);
      subs.forEach((s, i) => {
        rows.push([
          nameOf(s, i), formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax),
          JSON.stringify(s.answers).slice(0, 300),
        ]);
      });
    }
    const csv = rows.map((r) => r.map(csvCell).join(';')).join('\n');
    downloadFile(`resultaten-${widget.code}${anonymous ? '-anoniem' : ''}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    toast(anonymous ? 'Anonieme CSV geëxporteerd' : 'CSV geëxporteerd — dit bestand bevat namen van leerlingen, bewaar het zorgvuldig', 'ok');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/resultaten" className="hint" style={{ textDecoration: 'none' }}>← Alle resultaten</Link>
          <h1 style={{ marginTop: 4 }}>{def.icon} {widget.title}</h1>
          <p className="sub">{def.name} · code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong></p>
        </div>
        <div className="page-head-actions">
          <Link to={`/bewerk/${widget.id}`} className="btn btn-ghost">✏️ Bewerken</Link>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>📮 Resultaatcode plakken</button>
          <button className="btn btn-ghost" onClick={() => exportCsv(false)} disabled={subs.length === 0}>📄 CSV exporteren</button>
          <button className="btn btn-quiet" onClick={() => exportCsv(true)} disabled={subs.length === 0} title="Voor teamoverleg: zonder leerlingnamen">CSV zonder namen</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 22 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{subs.length}</div>
          <div className="hint">inzendingen</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: avg === null ? 'var(--text-faint)' : avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }}>
            {avg === null ? '—' : `${avg}%`}
          </div>
          <div className="hint">gemiddelde score</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: subs.some((s) => s.status === 'submitted') ? 'var(--warn)' : 'var(--ok)' }}>
            {subs.filter((s) => s.status === 'submitted').length}
          </div>
          <div className="hint">nog te beoordelen</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>
            {subs.length > 0 ? formatDuration(Math.round(subs.reduce((a, s) => a + s.durationSec, 0) / subs.length)) : '—'}
          </div>
          <div className="hint">gemiddelde duur</div>
        </div>
      </div>

      {busy.length > 0 && (
        <div className="callout" role="status" aria-live="polite" style={{ alignItems: 'center' }}>
          <span aria-hidden>🟢</span>
          <div>
            <strong>Nu bezig op dit toestel:</strong>{' '}
            {busy.map((e) => e.studentName).join(', ')}
            <span className="hint"> — dit overzicht ververst vanzelf zodra ze indienen.</span>
          </div>
        </div>
      )}

      {isQuiz && subs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} role="tablist">
          <button className={`btn btn-sm ${tab === 'students' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'students'} onClick={() => setTab('students')}>
            👥 Per leerling
          </button>
          <button className={`btn btn-sm ${tab === 'questions' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>
            ❓ Per vraag
          </button>
          {(widget.config as QuizConfig).questions.some((q) => q.type === 'long') && (
            <button className={`btn btn-sm ${tab === 'grade' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'grade'} onClick={() => setTab('grade')}>
              ✍️ Nakijken {subs.filter((s) => s.status === 'submitted').length > 0 && `(${subs.filter((s) => s.status === 'submitted').length})`}
            </button>
          )}
        </div>
      )}

      {subs.length === 0 ? (
        <EmptyState icon="📭" title="Nog geen inzendingen voor deze widget">
          <p>Deel de code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong> met je klas om resultaten te verzamelen.</p>
        </EmptyState>
      ) : tab === 'questions' && isQuiz ? (
        <QuestionStats widget={widget} subs={subs} />
      ) : tab === 'grade' && isQuiz ? (
        <GradingCockpit widget={widget} subs={subs} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Leerling</th>
                <th>Ingediend</th>
                <th>Duur</th>
                <th>Score</th>
                <th>Status</th>
                <th aria-label="acties" />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const p = s.totalMax > 0 ? pct(s.totalEarned, s.totalMax) : null;
                return (
                  <tr key={s.id} onClick={() => setDetail(s)}>
                    <td><strong>{s.studentName}</strong></td>
                    <td className="hint">{formatDate(s.submittedAt)}</td>
                    <td className="hint">{formatDuration(s.durationSec)}</td>
                    <td>
                      {p === null ? <span className="hint">—</span> : (
                        <div className="scorebar">
                          <div className="bar"><div style={{ width: `${p}%`, background: p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)' }} /></div>
                          <strong>{s.totalEarned}/{s.totalMax}</strong>
                        </div>
                      )}
                    </td>
                    <td>
                      {s.status === 'submitted'
                        ? <span className="badge badge-warn">✍️ beoordelen</span>
                        : <span className="badge badge-ok">✓ verbeterd</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Inzending van ${s.studentName} verwijderen`}
                        onClick={() => setDeleteTarget(s)} style={{ color: 'var(--err)' }}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && (
        <ResultCodeImportModal
          widget={widget}
          onClose={() => setImportOpen(false)}
          onImported={(n) => toast(`${n} ${n === 1 ? 'resultaat' : 'resultaten'} geïmporteerd`, 'ok')}
        />
      )}
      {detail && <SubmissionModal widget={widget} submission={detail} onClose={() => setDetail(null)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Inzending verwijderen?"
          message={`De inzending van ${deleteTarget.studentName} wordt definitief verwijderd.`}
          onConfirm={() => { deleteSubmission(deleteTarget.id); toast('Inzending verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function formatAnswer(q: Question, answer: unknown): string {
  if (answer === undefined || answer === null) return '—';
  switch (q.type) {
    case 'mc': return typeof answer === 'number' ? q.options[answer] ?? '—' : '—';
    case 'multi': return Array.isArray(answer) ? (answer as number[]).map((i) => q.options[i]).join(', ') : '—';
    case 'tf': return answer === true ? 'Juist' : answer === false ? 'Onjuist' : '—';
    case 'match': return Array.isArray(answer) ? q.pairs.map((p, i) => `${p.left}→${typeof (answer as any[])[i] === 'number' ? q.pairs[(answer as any[])[i] as number]?.right ?? '?' : '?'}`).join('; ') : '—';
    case 'long': {
      if (typeof answer === 'string') return answer;
      const lv = answer as LongAnswerValue | null;
      const parts = [lv?.tekst, lv?.tekening ? '🎨 [tekening]' : '', lv?.audio ? '🎤 [audio]' : ''].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'order': return Array.isArray(answer) ? (answer as number[]).map((i) => q.items[i]).join(' → ') : '—';
    case 'gap': return Array.isArray(answer) ? (answer as string[]).join(' / ') : '—';
    default: return String(answer);
  }
}

/** Detail + manuele beoordeling van één inzending. */
function SubmissionModal({ widget, submission, onClose }: { widget: Widget; submission: Submission; onClose: () => void }) {
  const toast = useToast();
  const isQuiz = QUIZ_FAMILY.has(widget.type);
  const [scores, setScores] = useState(submission.itemScores ?? {});
  const [feedback, setFeedback] = useState(submission.teacherFeedback ?? '');

  const questions = isQuiz ? (widget.config as QuizConfig).questions : [];
  const totalMax = submission.totalMax;
  const totalEarned = Object.values(scores).length > 0
    ? Math.round(Object.values(scores).reduce((a, s) => a + s.earned, 0) * 100) / 100
    : submission.totalEarned;

  const save = () => {
    const hasPending = Object.values(scores).some((s) => s.mode === 'pending');
    // actuele versie als basis nemen: de leerling kan ná het openen van deze
    // modal nog een foutenanalyse of doelreflectie bewaard hebben (zelfde toestel)
    const current = getSubmissions().find((x) => x.id === submission.id) ?? submission;
    saveSubmission({
      ...current,
      itemScores: Object.keys(scores).length > 0 ? scores : current.itemScores,
      totalEarned,
      status: hasPending ? 'submitted' : 'graded',
      teacherFeedback: feedback,
    });
    toast('Beoordeling opgeslagen', 'ok');
    onClose();
  };

  const drawing = (submission.answers as any)?.tekening;

  return (
    <Modal title={`Inzending van ${submission.studentName}`} onClose={onClose} wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
          <button className="btn btn-primary" onClick={save}>Beoordeling opslaan</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {totalMax > 0 && <ScoreRing percent={pct(totalEarned, totalMax)} />}
        <div>
          <p style={{ margin: 0 }}><strong>Score:</strong> {totalEarned} / {totalMax || '—'}</p>
          <p style={{ margin: 0 }} className="hint">Ingediend: {formatDate(submission.submittedAt)} · duur {formatDuration(submission.durationSec)}</p>
          {submission.focusLosses !== undefined && (
            <p style={{ margin: '4px 0 0' }}>
              {submission.focusLosses > 0
                ? <span className="badge badge-warn">👀 verliet het toetsvenster {submission.focusLosses}×</span>
                : <span className="badge badge-ok">🛡 bleef in het toetsvenster</span>}
            </p>
          )}
        </div>
      </div>

      {(() => {
        const fa = submission.answers['_foutenanalyse'] as { volgendeKeer?: string } | undefined;
        const doel = submission.answers['_doel'] as { proces?: string; streef?: number; vrij?: string } | undefined;
        const doelReflectie = submission.answers['_doelreflectie'] as string | undefined;
        if (!fa?.volgendeKeer && !doel && !doelReflectie) return null;
        return (
          <div className="callout" style={{ marginBottom: 12 }}>
            <span aria-hidden>🧠</span>
            <div>
              {doel && (
                <p style={{ margin: '0 0 4px' }}>
                  <strong>Doel van de leerling:</strong>{' '}
                  {[doel.proces, doel.streef ? `streefscore ${doel.streef}%` : '', doel.vrij].filter(Boolean).join(' · ')}
                </p>
              )}
              {doelReflectie && <p style={{ margin: '0 0 4px' }}><strong>Reflectie op het doel:</strong> “{doelReflectie}”</p>}
              {fa?.volgendeKeer && <p style={{ margin: 0 }}><strong>Voornemen na foutenanalyse:</strong> “{fa.volgendeKeer}”</p>}
            </div>
          </div>
        );
      })()}
      {typeof drawing === 'string' && drawing.startsWith('data:image') && (
        <div style={{ marginBottom: 14 }}>
          <h3>🎨 Tekening</h3>
          <img src={drawing} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
        </div>
      )}

      {isQuiz ? (
        <div>
          {questions
            .filter((q) => q.type !== 'info')
            // vragenpool: toon alleen vragen die deze leerling effectief kreeg
            .filter((q) => !submission.itemScores || q.id in submission.itemScores)
            .map((q, i) => {
            const ans = submission.answers[q.id];
            const score = scores[q.id] ?? gradeQuestion(q, ans);
            const isOpen = q.type === 'long';
            const conf = (submission.answers['_zekerheid'] as Record<string, string> | undefined)?.[q.id];
            // "_hints"-vorm: "vraagid" (1 hint) of "vraagid:2" (twee treden)
            const hintEntry = Array.isArray(submission.answers['_hints'])
              ? (submission.answers['_hints'] as string[]).find((h) => h === q.id || h.startsWith(q.id + ':'))
              : undefined;
            const hintLevel = hintEntry ? (hintEntry.includes(':') ? parseInt(hintEntry.split(':')[1], 10) || 1 : 1) : 0;
            const foutLabel = (submission.answers['_foutenanalyse'] as { labels?: Record<string, string> } | undefined)?.labels?.[q.id];
            const FOUT_TEKST: Record<string, string> = { slordig: '🙈 slordig', gelezen: '👓 verkeerd gelezen', kennis: '📖 stof niet gekend', aanpak: '🧭 aanpak niet gekend' };
            return (
              <div key={q.id} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>V{i + 1}.</strong>
                  <span style={{ flex: 1 }}>{q.prompt || (q.type === 'gap' ? 'Invuloefening' : '')}</span>
                  {hintLevel > 0 && (
                    <span className="badge" title="Aantal geopende hints (hintladder)">
                      💡 {hintLevel === 1 ? 'hint' : `${hintLevel} hints`}
                    </span>
                  )}
                  {foutLabel && FOUT_TEKST[foutLabel] && (
                    <span className="badge" title="Eigen foutenanalyse van de leerling">{FOUT_TEKST[foutLabel]}</span>
                  )}
                  {conf && (
                    <span
                      className={`badge ${conf === 'zeker' && score.earned < score.max && score.mode !== 'pending' ? 'badge-err' : ''}`}
                      title={conf === 'zeker' && score.earned < score.max ? 'Zeker maar fout: mogelijke misvatting' : 'Zelfinschatting van de leerling'}
                    >
                      {conf === 'zeker' ? '🎯 was zeker' : conf === 'twijfel' ? '🤔 twijfelde' : '🎲 gokte'}
                    </span>
                  )}
                  <span className={`badge ${score.mode === 'pending' ? 'badge-warn' : score.earned >= score.max ? 'badge-ok' : score.earned > 0 ? 'badge-warn' : 'badge-err'}`}>
                    {score.mode === 'pending' ? 'te beoordelen' : `${score.earned}/${score.max}`}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                  <strong>Antwoord:</strong> {formatAnswer(q, ans)}
                </p>
                {q.type === 'long' && typeof ans === 'object' && ans !== null && (
                  <div style={{ marginTop: 6 }}>
                    {(ans as LongAnswerValue).tekening && (
                      <img src={(ans as LongAnswerValue).tekening} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} />
                    )}
                    {(ans as LongAnswerValue).audio && (
                      <audio controls src={(ans as LongAnswerValue).audio} style={{ display: 'block', maxWidth: '100%', marginTop: 6 }} />
                    )}
                  </div>
                )}
                {q.type === 'long' && q.modelAnswer && (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: '0.88rem' }}>
                    <strong>Modelantwoord:</strong> {q.modelAnswer}
                  </p>
                )}
                {isOpen && (q.type === 'long' && (q.rubric ?? []).filter((r) => r.criterion.trim()).length > 0 ? (
                  <RubricGrader
                    rubric={(q.rubric ?? []).filter((r) => r.criterion.trim())}
                    maxPoints={q.points}
                    onScore={(earned, breakdown) => {
                      setScores((sc) => ({
                        ...sc,
                        [q.id]: { earned, max: q.points, mode: 'manual', comment: breakdown },
                      }));
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      Punten:
                      <input
                        className="input input-sm" type="number" min={0} max={q.points} step={0.5}
                        style={{ width: 80, marginLeft: 6 }}
                        value={score.mode === 'pending' ? '' : score.earned}
                        placeholder="?"
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Math.max(0, Math.min(q.points, parseFloat(e.target.value) || 0));
                          setScores((sc) => ({
                            ...sc,
                            [q.id]: v === null
                              ? { earned: 0, max: q.points, mode: 'pending' }
                              : { earned: v, max: q.points, mode: 'manual' },
                          }));
                        }}
                      />
                    </label>
                    <span className="hint">van {q.points}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        Object.keys(submission.answers).length > 0 && !drawing && (
          <div className="card card-pad">
            <h3>Details</h3>
            {Object.entries(submission.answers).map(([k, v]) => (
              <p key={k} style={{ margin: '4px 0' }}>
                <strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </p>
            ))}
          </div>
        )
      )}

      {!isQuiz && Object.keys(scores).length > 0 && (
        // generieke manuele beoordeling voor widgets zonder vragenlijst (tekening, mindmap, …)
        <div style={{ marginTop: 8 }}>
          {Object.entries(scores)
            .filter(([, sc]) => sc.mode === 'pending' || sc.mode === 'manual')
            .map(([key, sc]) => (
              <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontWeight: 600 }}>
                  Punten voor {key === 'tekening' ? 'de tekening' : key === 'mindmap' ? 'de mindmap' : `“${key}”`}:
                  <input
                    className="input input-sm" type="number" min={0} max={sc.max} step={0.5}
                    style={{ width: 80, marginLeft: 6 }}
                    value={sc.mode === 'pending' ? '' : sc.earned}
                    placeholder="?"
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Math.max(0, Math.min(sc.max, parseFloat(e.target.value) || 0));
                      setScores((prev) => ({
                        ...prev,
                        [key]: v === null
                          ? { earned: 0, max: sc.max, mode: 'pending' }
                          : { earned: v, max: sc.max, mode: 'manual' },
                      }));
                    }}
                  />
                </label>
                <span className="hint">van {sc.max}</span>
              </div>
            ))}
        </div>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="teacher-feedback">Feedback voor de leerling (optioneel)</label>
        <textarea
          id="teacher-feedback" className="textarea" rows={3} value={feedback}
          placeholder="Tip: benoem wat al lukt, wat nog niet, en wat de volgende stap is — gericht op de taak."
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/** Resultaatcodes van leerlingen (thuiswerk via draagbare link) inlezen. */
function ResultCodeImportModal({
  widget, onClose, onImported,
}: { widget: Widget; onClose: () => void; onImported: (n: number) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const doImport = () => {
    const codes = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    let ok = 0;
    const existing = getSubmissions();
    const seen = new Set(existing.map((s) => `${s.widgetId}::${s.studentName}::${s.submittedAt}`));
    for (const code of codes) {
      const sub = decodeSubmission(code);
      if (!sub) continue;
      if (sub.widgetId !== widget.id && sub.widgetCode !== widget.code) continue;
      // dubbele import vermijden — ook binnen dezelfde plak-actie
      const dupKey = `${widget.id}::${sub.studentName}::${sub.submittedAt}`;
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
      saveSubmission({ ...sub, id: uid(), widgetId: widget.id });
      ok++;
    }
    if (ok === 0) {
      setError('Geen geldige resultaatcodes voor deze widget gevonden. Controleer of de volledige code geplakt is en of ze bij deze widget hoort.');
      return;
    }
    onImported(ok);
    onClose();
  };

  return (
    <Modal
      title="📮 Resultaatcodes plakken"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={doImport}>Importeren</button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 8 }}>
        Leerlingen die thuis via de draagbare link werkten, krijgen na het indienen een <strong>resultaatcode</strong>.
        Plak hier één of meerdere codes (gescheiden door een spatie of nieuwe regel) om ze aan deze resultaten toe te voegen.
      </p>
      <textarea
        className="textarea" rows={6}
        placeholder="WF1.…"
        value={text}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
      />
      {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600 }}>{error}</p>}
    </Modal>
  );
}

/** Rubric-beoordeling: per criterium punten geven; totaal en verantwoording worden samengesteld. */
function RubricGrader({
  rubric, maxPoints, onScore,
}: {
  rubric: { criterion: string; points: number }[];
  maxPoints: number;
  onScore: (earned: number, breakdown: string) => void;
}) {
  const [vals, setVals] = useState<(number | null)[]>(rubric.map(() => null));

  const apply = (next: (number | null)[]) => {
    setVals(next);
    if (next.every((v) => v !== null)) {
      const raw = next.reduce((a: number, v) => a + (v ?? 0), 0);
      const earned = Math.min(maxPoints, Math.round(raw * 100) / 100);
      const breakdown = rubric.map((r, i) => `${r.criterion}: ${next[i]}/${r.points}`).join(' · ');
      onScore(earned, breakdown);
    }
  };

  const sum = vals.reduce((a: number, v) => a + (v ?? 0), 0);

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '0.88rem' }}>Beoordeel per criterium:</p>
      {rubric.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: '0.9rem' }}>{r.criterion}</span>
          <input
            className="input input-sm" type="number" min={0} max={r.points} step={0.5}
            style={{ width: 70 }}
            value={vals[i] === null ? '' : vals[i]!}
            placeholder="?"
            aria-label={`Punten voor: ${r.criterion}`}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(0, Math.min(r.points, parseFloat(e.target.value) || 0));
              const next = vals.slice();
              next[i] = v;
              apply(next);
            }}
          />
          <span className="hint">/ {r.points}</span>
        </div>
      ))}
      <p className="hint" aria-live="polite">
        {vals.every((v) => v !== null)
          ? `✓ Totaal: ${Math.min(maxPoints, sum)} van ${maxPoints}`
          : 'Vul alle criteria in om de score toe te kennen.'}
      </p>
    </div>
  );
}

/** Verdeling over de antwoordopties: welke afleider koos de klas het vaakst? */
function DistractorBars({ q, subs }: { q: Question; subs: Submission[] }) {
  if (q.type !== 'mc' && q.type !== 'multi' && q.type !== 'tf') return null;
  const relevant = subs.filter((s) => !s.itemScores || q.id in s.itemScores);
  if (relevant.length === 0) return null;

  const rows: { label: string; correct: boolean; count: number }[] =
    q.type === 'tf'
      ? [true, false].map((v) => ({
          label: v ? 'Juist' : 'Onjuist',
          correct: q.answer === v,
          count: relevant.filter((s) => s.answers[q.id] === v).length,
        }))
      : q.options.map((opt, i) => ({
          label: opt || `Optie ${i + 1}`,
          correct: q.type === 'mc' ? q.correctIndex === i : q.correctIndices.includes(i),
          count: relevant.filter((s) => {
            const a = s.answers[q.id];
            return q.type === 'mc' ? a === i : Array.isArray(a) && (a as number[]).includes(i);
          }).length,
        }));

  const maxWrong = Math.max(0, ...rows.filter((r) => !r.correct).map((r) => r.count));
  const total = Math.max(1, relevant.length);

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>
        Antwoordverdeling (distractor-analyse)
      </summary>
      <div style={{ paddingTop: 8 }}>
        {rows.map((r, i) => {
          const p = Math.round((r.count / total) * 100);
          const isTopDistractor = !r.correct && r.count > 0 && r.count === maxWrong && r.count >= Math.ceil(total / 4);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.86rem' }}>
              <span style={{ width: 18 }} aria-hidden>{r.correct ? '✓' : ''}</span>
              <span style={{ flex: '0 0 40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <div className="bar" style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
                <div style={{ width: `${p}%`, height: '100%', background: r.correct ? 'var(--ok)' : 'var(--err)', opacity: r.correct ? 1 : 0.75 }} />
              </div>
              <span style={{ width: 70, textAlign: 'right', color: 'var(--text-soft)' }}>{r.count} ({p}%)</span>
              {isTopDistractor && <span className="badge badge-warn" title="Deze afleider werd opvallend vaak gekozen — mogelijke misvatting">⚠ populair</span>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Aggregatie per leerdoel + heatmap leerlingen × doelen. */
function GoalStats({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const questions = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
  const goals = [...new Set(questions.map((q) => q.goal?.trim()).filter((g): g is string => !!g))];
  if (goals.length === 0 || subs.length === 0) return null;

  const scoreFor = (s: Submission, goal: string) => {
    let earned = 0, max = 0;
    for (const q of questions) {
      if (q.goal?.trim() !== goal) continue;
      if (s.itemScores && !(q.id in s.itemScores)) continue;
      const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
      if (sc.mode === 'pending') continue;
      earned += sc.earned; max += sc.max;
    }
    return max > 0 ? Math.round((earned / max) * 100) : null;
  };

  const cellColor = (p: number | null) =>
    p === null ? 'var(--bg-sunken)' : p >= 70 ? 'var(--ok-soft)' : p >= 45 ? 'var(--warn-soft)' : 'var(--err-soft)';
  const cellText = (p: number | null) =>
    p === null ? 'var(--text-faint)' : p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <h3>🎯 Beheersing per leerdoel</h3>
      {goals.map((goal) => {
        const ps = subs.map((s) => scoreFor(s, goal)).filter((p): p is number => p !== null);
        const avg = ps.length > 0 ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
        return (
          <div key={goal} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 3 }}>
              <span>{goal}</span>
              <span style={{ color: avg === null ? 'var(--text-faint)' : cellText(avg) }}>{avg === null ? '—' : `${avg}% gem.`}</span>
            </div>
            <div className="progressbar">
              <div style={{ width: `${avg ?? 0}%`, background: avg === null ? 'var(--text-faint)' : avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }} />
            </div>
          </div>
        );
      })}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-soft)' }}>
          Heatmap per leerling (voor klassenraad of remediëring)
        </summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Leerling</th>
                {goals.map((g) => <th key={g}>{g}</th>)}
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ cursor: 'default' }}>
                  <td><strong>{s.studentName}</strong></td>
                  {goals.map((g) => {
                    const p = scoreFor(s, g);
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
    </div>
  );
}

/** Statistieken per vraag: hoeveel % juist. */
function QuestionStats({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const questions = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
  const stats = useMemo(() => questions.map((q) => {
    let full = 0, partial = 0, zero = 0, pending = 0, got = 0;
    for (const s of subs) {
      // vragenpool: leerlingen die deze vraag niet kregen, tellen niet mee
      if (s.itemScores && !(q.id in s.itemScores)) continue;
      got++;
      const score = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
      if (score.mode === 'pending') pending++;
      else if (score.earned >= score.max && score.max > 0) full++;
      else if (score.earned > 0) partial++;
      else zero++;
    }
    return { q, full, partial, zero, pending, got };
  }), [widget.id, subs]);

  return (
    <div>
      <GoalStats widget={widget} subs={subs} />
      {stats.map(({ q, full, partial, zero, pending, got }, i) => {
        const total = Math.max(1, got);
        const okPct = Math.round((full / total) * 100);
        return (
          <div key={q.id} className="card" style={{ padding: '13px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>V{i + 1}.</strong>
              <span style={{ flex: 1 }}>{q.prompt || '(invuloefening)'}</span>
              <span className={`badge ${okPct >= 70 ? 'badge-ok' : okPct >= 40 ? 'badge-warn' : 'badge-err'}`}>{okPct}% helemaal juist</span>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', marginTop: 10, background: 'var(--bg-sunken)' }}
              role="img" aria-label={`${full} juist, ${partial} deels, ${zero} fout, ${pending} nog te beoordelen`}>
              <div style={{ width: `${(full / total) * 100}%`, background: 'var(--ok)' }} />
              <div style={{ width: `${(partial / total) * 100}%`, background: 'var(--warn)' }} />
              <div style={{ width: `${(zero / total) * 100}%`, background: 'var(--err)' }} />
              <div style={{ width: `${(pending / total) * 100}%`, background: 'var(--text-faint)' }} />
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              ✓ {full} juist · ◐ {partial} deels · ✗ {zero} fout{pending > 0 ? ` · ✍️ ${pending} te beoordelen` : ''}
              {got < subs.length ? ` · (${got} van ${subs.length} leerlingen kreeg deze vraag)` : ''}
            </div>
            <DistractorBars q={q} subs={subs} />
            {(() => {
              // voorzichtige item-analyse: alleen signalen, alleen bij voldoende inzendingen
              const MIN_N = 8;
              if (got < MIN_N) return null;
              const relevant = subs.filter((s) => (!s.itemScores || q.id in s.itemScores) && s.totalMax > 0);
              if (relevant.length < MIN_N) return null;
              const correct = (s: Submission) => {
                const sc = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
                return sc.mode !== 'pending' && sc.max > 0 && sc.earned >= sc.max;
              };
              const sorted = relevant.slice().sort((a, b) => (b.totalEarned / b.totalMax) - (a.totalEarned / a.totalMax));
              const half = Math.floor(sorted.length / 2);
              const top = sorted.slice(0, half);
              const bottom = sorted.slice(sorted.length - half);
              const pTop = top.filter(correct).length / Math.max(1, top.length);
              const pBottom = bottom.filter(correct).length / Math.max(1, bottom.length);
              const p = full / got;
              let signal: string | null = null;
              if (pTop <= pBottom && p > 0.05 && p < 0.95) {
                signal = 'Sterk scorende leerlingen doen het hier niet beter dan de rest — bekijk deze vraag eens (dubbelzinnig? verkeerde sleutel?).';
              } else if (p < 0.2) {
                signal = 'Erg moeilijk voor deze groep — was de instructie of vraagstelling helder?';
              } else if (p > 0.92) {
                signal = 'Vrijwel iedereen juist — prima als opwarmer; als toetsvraag onderscheidt hij weinig.';
              }
              if (!signal) return null;
              return (
                <p className="hint" style={{ marginTop: 6 }}>
                  🔎 <em>Signaal (n={got}):</em> {signal}
                </p>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

// ── Nakijkcockpit: per vraag verbeteren met feedbackbank ────────────────────

const FEEDBACKBANK_KEY = 'wf.feedbackbank.v1';

function getFeedbackbank(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACKBANK_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveFeedbackbank(list: string[]) {
  try { localStorage.setItem(FEEDBACKBANK_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* best effort */ }
}

function GradingCockpit({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const openQuestions = (widget.config as QuizConfig).questions.filter((q) => q.type === 'long');
  const [qid, setQid] = useState(openQuestions[0]?.id ?? '');
  const [bank, setBank] = useState<string[]>(getFeedbackbank);
  const toast = useToast();
  const q = openQuestions.find((x) => x.id === qid);

  if (!q) return <EmptyState icon="✅" title="Geen open vragen om na te kijken" />;

  const rows = subs.filter((s) => !s.itemScores || q.id in s.itemScores);
  const rubric = (q.rubric ?? []).filter((r) => r.criterion.trim());

  return (
    <div>
      <div className="callout">
        <span aria-hidden>💡</span>
        <div>Per <strong>vraag</strong> verbeteren houdt je beoordelingskader constant: sneller én consistenter dan per leerling.</div>
      </div>
      <div className="field" style={{ maxWidth: 520 }}>
        <label>Open vraag</label>
        <select className="select" value={qid} onChange={(e) => setQid(e.target.value)}>
          {openQuestions.map((oq, i) => (
            <option key={oq.id} value={oq.id}>
              {i + 1}. {oq.prompt.slice(0, 80)}
            </option>
          ))}
        </select>
        {q.modelAnswer && (
          <span className="hint">📖 Modelantwoord: {q.modelAnswer}</span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="📭" title="Nog geen inzendingen met deze vraag" />
      ) : (
        rows.map((s) => (
          <CockpitRow
            key={s.id}
            submission={s}
            question={q}
            rubric={rubric}
            bank={bank}
            onBankAdd={(text) => {
              const next = [text, ...bank.filter((b) => b !== text)];
              setBank(next);
              saveFeedbackbank(next);
              toast('Toegevoegd aan je feedbackbank', 'ok');
            }}
            onSaved={() => toast('Beoordeling opgeslagen', 'ok')}
          />
        ))
      )}
    </div>
  );
}

function CockpitRow({
  submission, question, rubric, bank, onBankAdd, onSaved,
}: {
  submission: Submission;
  question: Question & { type: 'long' };
  rubric: { criterion: string; points: number }[];
  bank: string[];
  onBankAdd: (text: string) => void;
  onSaved: () => void;
}) {
  const existing = submission.itemScores?.[question.id];
  const [points, setPoints] = useState<number | null>(existing && existing.mode !== 'pending' ? existing.earned : null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const answer = submission.answers[question.id];

  const save = () => {
    if (points === null) return;
    // actuele versie als basis: geen tussentijdse leerling-updates overschrijven
    const current = getSubmissions().find((x) => x.id === submission.id) ?? submission;
    const itemScores = { ...(current.itemScores ?? {}) };
    itemScores[question.id] = { earned: points, max: question.points, mode: 'manual', comment: comment.trim() || undefined };
    const totalEarned = Math.round(Object.values(itemScores).reduce((a, sc) => a + sc.earned, 0) * 100) / 100;
    const hasPending = Object.values(itemScores).some((sc) => sc.mode === 'pending');
    saveSubmission({ ...current, itemScores, totalEarned, status: hasPending ? 'submitted' : 'graded' });
    onSaved();
  };

  const graded = existing && existing.mode !== 'pending';

  return (
    <div className="card" style={{ padding: '13px 16px', marginBottom: 10, borderLeft: graded ? '4px solid var(--ok)' : '4px solid var(--warn)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <strong>{submission.studentName}</strong>
        {graded ? <span className="badge badge-ok">✓ {existing.earned}/{question.points}</span> : <span className="badge badge-warn">te beoordelen</span>}
      </div>
      <div style={{ background: 'var(--bg-sunken)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
        {(() => {
          const lv: LongAnswerValue = typeof answer === 'string' ? { tekst: answer } : ((answer as LongAnswerValue) ?? {});
          if (!lv.tekst?.trim() && !lv.tekening && !lv.audio) {
            return <em style={{ color: 'var(--text-faint)' }}>(geen antwoord)</em>;
          }
          return (
            <>
              {lv.tekst?.trim() && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{lv.tekst}</p>}
              {lv.tekening && <img src={lv.tekening} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', marginTop: lv.tekst ? 8 : 0 }} />}
              {lv.audio && <audio controls src={lv.audio} style={{ display: 'block', maxWidth: '100%', marginTop: 6 }} />}
            </>
          );
        })()}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
          Punten:
          <input
            className="input input-sm" type="number" min={0} max={question.points} step={0.5}
            style={{ width: 76, marginLeft: 6 }}
            value={points ?? ''}
            placeholder="?"
            onChange={(e) => setPoints(e.target.value === '' ? null : Math.max(0, Math.min(question.points, parseFloat(e.target.value) || 0)))}
          />
          <span className="hint"> / {question.points}</span>
        </label>
        <div style={{ flex: '1 1 260px' }}>
          <textarea
            className="textarea" rows={2}
            placeholder="Feedback: wat lukt al, wat nog niet, volgende stap…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {rubric.length > 0 && (
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Rubric: {rubric.map((r) => `${r.criterion} (${r.points})`).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {bank.slice(0, 8).map((b, i) => (
              <button key={i} className="chip" style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                title="Invoegen in de feedback"
                onClick={() => setComment((c) => (c ? c + ' ' + b : b))}>
                {b.length > 42 ? b.slice(0, 40) + '…' : b}
              </button>
            ))}
            {comment.trim() && !bank.includes(comment.trim()) && (
              <button className="btn btn-sm btn-quiet" onClick={() => onBankAdd(comment.trim())}>
                ➕ Bewaar in feedbackbank
              </button>
            )}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={points === null} onClick={save}>
          Opslaan ✓
        </button>
      </div>
    </div>
  );
}
