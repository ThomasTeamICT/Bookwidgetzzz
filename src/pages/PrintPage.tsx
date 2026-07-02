import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getWidget } from '../lib/storage';
import type { GapQuestion, Question, QuizConfig } from '../lib/types';
import { extractGaps, gapPreview, quizMaxScore } from '../lib/grading';
import { CheckRow } from '../components/ui';

/** Afdrukbare versie van quiz/werkblad/exit-ticket, met of zonder correctiesleutel. */
export function PrintPage() {
  const { id } = useParams();
  const widget = id ? getWidget(id) : undefined;
  const [withKey, setWithKey] = useState(false);

  if (!widget || !['quiz', 'worksheet', 'exitticket'].includes(widget.type)) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1>Niet afdrukbaar</h1>
        <p style={{ color: 'var(--text-soft)' }}>Deze widget bestaat niet of heeft geen afdrukbare versie.</p>
        <Link to="/widgets" className="btn btn-primary">← Naar mijn widgets</Link>
      </div>
    );
  }

  const config = widget.config as QuizConfig;
  const questions = config.questions;
  let printNum = 0;

  return (
    <div style={{ background: '#fff', color: '#111', minHeight: '100vh' }}>
      <div className="topbar" style={{ position: 'static' }}>
        <Link to={`/bewerk/${widget.id}`} className="btn btn-sm btn-quiet">← Terug naar de editor</Link>
        <div className="topbar-spacer" />
        <CheckRow checked={withKey} onChange={setWithKey} label="Correctiesleutel tonen" />
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>🖨 Afdrukken / PDF</button>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px 60px', fontSize: '15px', lineHeight: 1.6 }}>
        <header style={{ borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
            {widget.title}
            {withKey && <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}> — CORRECTIESLEUTEL</span>}
          </h1>
          <div style={{ display: 'flex', gap: 26, marginTop: 10, fontSize: '0.95rem' }}>
            <span>Naam: ________________________________</span>
            <span>Klas: __________</span>
            <span>Datum: ____ / ____ / ______</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>/ {quizMaxScore(config)}</span>
          </div>
          {widget.settings.instructions && (
            <p style={{ margin: '10px 0 0', fontStyle: 'italic' }}>{widget.settings.instructions}</p>
          )}
        </header>

        {questions.map((q) => {
          if (q.type === 'info') {
            return (
              <div key={q.id} style={{ margin: '14px 0', padding: '10px 14px', background: '#f3f4f6', borderRadius: 8, breakInside: 'avoid' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{q.prompt}</p>
                {q.imageUrl && <img src={q.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 240, marginTop: 8 }} />}
              </div>
            );
          }
          printNum++;
          return (
            <div key={q.id} style={{ margin: '18px 0', breakInside: 'avoid' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 650 }}>
                {printNum}. {q.type === 'gap' ? '' : q.prompt}
                <span style={{ float: 'right', fontWeight: 400, fontSize: '0.85rem' }}>… / {q.points}</span>
              </p>
              {q.imageUrl && <img src={q.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 240, marginBottom: 8 }} />}
              <PrintAnswerArea q={q} withKey={withKey} />
            </div>
          );
        })}

        <footer style={{ marginTop: 34, borderTop: '1px solid #d1d5db', paddingTop: 8, fontSize: '0.8rem', color: '#6b7280' }}>
          Gemaakt met WidgetFabriek · code {widget.code}
        </footer>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#b91c1c', fontWeight: 700 }}>{children}</span>;
}

function PrintAnswerArea({ q, withKey }: { q: Question; withKey: boolean }) {
  const lineStyle: React.CSSProperties = { borderBottom: '1px solid #9ca3af', height: 26 };
  switch (q.type) {
    case 'mc':
    case 'multi':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {q.options.map((o, i) => {
            const correct = q.type === 'mc' ? i === q.correctIndex : q.correctIndices.includes(i);
            return (
              <li key={i} style={{ margin: '4px 0' }}>
                <span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #111', borderRadius: q.type === 'mc' ? '50%' : 3, marginRight: 9, verticalAlign: '-2px', background: withKey && correct ? '#111' : 'transparent' }} />
                {String.fromCharCode(65 + i)}. {o} {withKey && correct && <Key>✓</Key>}
              </li>
            );
          })}
        </ul>
      );
    case 'tf':
      return (
        <p style={{ margin: '4px 0' }}>
          ⬜ Juist {withKey && q.answer && <Key>✓</Key>} &nbsp;&nbsp; ⬜ Onjuist {withKey && !q.answer && <Key>✓</Key>}
        </p>
      );
    case 'short':
    case 'number':
      return withKey
        ? <p style={{ margin: '4px 0' }}><Key>{q.type === 'short' ? q.accepted.filter(Boolean).join(' / ') : `${q.answer}${q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}`}</Key></p>
        : <div style={lineStyle} />;
    case 'long':
      return withKey && q.modelAnswer
        ? <p style={{ margin: '4px 0' }}><Key>Modelantwoord: {q.modelAnswer}</Key></p>
        : <div>{[0, 1, 2, 3].map((i) => <div key={i} style={lineStyle} />)}</div>;
    case 'gap': {
      const gq = q as GapQuestion;
      if (withKey) {
        return (
          <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
            {gq.text.split(/\[([^\]]+)\]/g).map((part, i) =>
              i % 2 === 1 ? <Key key={i}> {part.split('|')[0]} </Key> : <span key={i}>{part}</span>
            )}
          </p>
        );
      }
      return <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{gapPreview(gq)}</p>;
    }
    case 'match':
      return (
        <div style={{ display: 'flex', gap: 40 }}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {q.pairs.map((p, i) => <li key={i}>{p.left} → ____ {withKey && <Key>({String.fromCharCode(97 + i)})</Key>}</li>)}
          </ol>
          <ol style={{ margin: 0, paddingLeft: 20, listStyleType: 'lower-alpha' }}>
            {q.pairs.map((p, i) => <li key={i}>{p.right}</li>)}
          </ol>
        </div>
      );
    case 'order':
      return (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {q.items.map((it, i) => (
            <li key={i} style={{ margin: '3px 0' }}>
              ____ {it} {withKey && <Key>(plaats {i + 1})</Key>}
            </li>
          ))}
        </ol>
      );
    case 'slider':
      return withKey
        ? <p style={{ margin: '4px 0' }}><Key>{q.answer}{q.tolerance > 0 ? ` (± ${q.tolerance})` : ''}</Key> (schaal {q.min}–{q.max})</p>
        : <p style={{ margin: '4px 0' }}>Antwoord (tussen {q.min} en {q.max}): __________</p>;
    default:
      return <div style={lineStyle} />;
  }
}
