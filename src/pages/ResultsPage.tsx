import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deleteSubmission, getSubmissions, getWidget, onStorageChange, saveSubmission } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import type { Question, QuizConfig, Submission, Widget } from '../lib/types';
import { csvCell, downloadFile, formatDate, formatDuration, pct } from '../lib/utils';
import { ConfirmModal, EmptyState, Modal, ScoreRing, useToast } from '../components/ui';
import { gradeQuestion } from '../lib/grading';

const QUIZ_FAMILY = new Set(['quiz', 'worksheet', 'exitticket']);

export function ResultsPage() {
  const { id } = useParams();
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);

  const widget = id ? getWidget(id) : undefined;
  const [detail, setDetail] = useState<Submission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [tab, setTab] = useState<'students' | 'questions'>('students');
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
  const scored = subs.filter((s) => s.totalMax > 0);
  const avg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length) : null;
  const isQuiz = QUIZ_FAMILY.has(widget.type);

  const exportCsv = () => {
    const rows: string[][] = [];
    if (isQuiz) {
      const qs = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Procent', ...qs.map((q, i) => `V${i + 1}: ${q.prompt.slice(0, 40)}`)]);
      for (const s of subs) {
        rows.push([
          s.studentName, formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax), s.totalMax > 0 ? `${pct(s.totalEarned, s.totalMax)}%` : '',
          ...qs.map((q) => formatAnswer(q, s.answers[q.id])),
        ]);
      }
    } else {
      rows.push(['Leerling', 'Ingediend', 'Duur', 'Score', 'Max', 'Details']);
      for (const s of subs) {
        rows.push([
          s.studentName, formatDate(s.submittedAt), formatDuration(s.durationSec),
          String(s.totalEarned), String(s.totalMax),
          JSON.stringify(s.answers).slice(0, 300),
        ]);
      }
    }
    const csv = rows.map((r) => r.map(csvCell).join(';')).join('\n');
    downloadFile(`resultaten-${widget.code}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    toast('CSV geëxporteerd', 'ok');
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
          <button className="btn btn-ghost" onClick={exportCsv} disabled={subs.length === 0}>📄 CSV exporteren</button>
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

      {isQuiz && subs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} role="tablist">
          <button className={`btn btn-sm ${tab === 'students' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'students'} onClick={() => setTab('students')}>
            👥 Per leerling
          </button>
          <button className={`btn btn-sm ${tab === 'questions' ? 'btn-primary' : 'btn-ghost'}`} role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>
            ❓ Per vraag
          </button>
        </div>
      )}

      {subs.length === 0 ? (
        <EmptyState icon="📭" title="Nog geen inzendingen voor deze widget">
          <p>Deel de code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong> met je klas om resultaten te verzamelen.</p>
        </EmptyState>
      ) : tab === 'questions' && isQuiz ? (
        <QuestionStats widget={widget} subs={subs} />
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
    saveSubmission({
      ...submission,
      itemScores: Object.keys(scores).length > 0 ? scores : submission.itemScores,
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
        </div>
      </div>

      {typeof drawing === 'string' && drawing.startsWith('data:image') && (
        <div style={{ marginBottom: 14 }}>
          <h3>🎨 Tekening</h3>
          <img src={drawing} alt={`Tekening van ${submission.studentName}`} style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
        </div>
      )}

      {isQuiz ? (
        <div>
          {questions.filter((q) => q.type !== 'info').map((q, i) => {
            const ans = submission.answers[q.id];
            const score = scores[q.id] ?? gradeQuestion(q, ans);
            const isOpen = q.type === 'long';
            return (
              <div key={q.id} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>V{i + 1}.</strong>
                  <span style={{ flex: 1 }}>{q.prompt || (q.type === 'gap' ? 'Invuloefening' : '')}</span>
                  <span className={`badge ${score.mode === 'pending' ? 'badge-warn' : score.earned >= score.max ? 'badge-ok' : score.earned > 0 ? 'badge-warn' : 'badge-err'}`}>
                    {score.mode === 'pending' ? 'te beoordelen' : `${score.earned}/${score.max}`}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', color: 'var(--text-soft)' }}>
                  <strong>Antwoord:</strong> {formatAnswer(q, ans)}
                </p>
                {q.type === 'long' && q.modelAnswer && (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: '0.88rem' }}>
                    <strong>Modelantwoord:</strong> {q.modelAnswer}
                  </p>
                )}
                {isOpen && (
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
                )}
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

      {typeof drawing === 'string' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <label style={{ fontWeight: 600 }}>
            Punten voor de tekening:
            <input
              className="input input-sm" type="number" min={0} max={10} step={0.5}
              style={{ width: 80, marginLeft: 6 }}
              value={scores['tekening']?.mode === 'pending' ? '' : scores['tekening']?.earned ?? ''}
              placeholder="?"
              onChange={(e) => {
                const v = e.target.value === '' ? null : Math.max(0, Math.min(10, parseFloat(e.target.value) || 0));
                setScores((sc) => ({
                  ...sc,
                  tekening: v === null ? { earned: 0, max: 10, mode: 'pending' } : { earned: v, max: 10, mode: 'manual' },
                }));
              }}
            />
          </label>
          <span className="hint">van 10</span>
        </div>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="teacher-feedback">Feedback voor de leerling (optioneel)</label>
        <textarea id="teacher-feedback" className="textarea" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Statistieken per vraag: hoeveel % juist. */
function QuestionStats({ widget, subs }: { widget: Widget; subs: Submission[] }) {
  const questions = (widget.config as QuizConfig).questions.filter((q) => q.type !== 'info');
  const stats = useMemo(() => questions.map((q) => {
    let full = 0, partial = 0, zero = 0, pending = 0;
    for (const s of subs) {
      const score = s.itemScores?.[q.id] ?? gradeQuestion(q, s.answers[q.id]);
      if (score.mode === 'pending') pending++;
      else if (score.earned >= score.max && score.max > 0) full++;
      else if (score.earned > 0) partial++;
      else zero++;
    }
    return { q, full, partial, zero, pending };
  }), [widget.id, subs.length]);

  return (
    <div>
      {stats.map(({ q, full, partial, zero, pending }, i) => {
        const total = Math.max(1, subs.length);
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
