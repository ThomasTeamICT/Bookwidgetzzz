import React, { useMemo, useRef, useState } from 'react';
import type {
  AccordionBlock, AttachmentBlock, AudioBlock, CalloutBlock, ChecklistBlock,
  ColumnsBlock, CourseBlock, EmbedBlock, HeadingBlock, ImageBlock, QuoteBlock,
  TableBlock, TermsBlock, TextBlock, VideoBlock, WidgetBlock,
} from '../../lib/courseTypes';
import { renderMarkdown } from '../../lib/markdown';
import { bumpAttemptCount, getAttemptCount, getSubmissions, getWidget, saveSubmission } from '../../lib/storage';
import { getTypeDef, type WidgetTypeDef } from '../../widgets/registry';
import type { PlayerResult } from '../../widgets/shared';
import type { Submission } from '../../lib/types';
import { pct, uid } from '../../lib/utils';

// ── Gedeelde weergave van cursusblokken ─────────────────────────────────────
//
// Eén component die elk bloktype rendert, gebruikt door de leerling-viewer,
// de printweergave en previews in de editor. Met interactive=false wordt
// alles statisch (geen iframes, geen afspeelbare widgets).

export interface BlockRendererProps {
  block: CourseBlock;
  /** false = statische weergave (bv. print): geen iframes of spelers. */
  interactive?: boolean;
  studentName?: string;
  /** Afgevinkte checklist-item-ids van dít blok. */
  checkedIds?: string[];
  onToggleCheck?: (itemId: string) => void;
  /** Accentkleur van de cursus (voor kaders en checkboxen). */
  accent?: string;
}

export function BlockRenderer(props: BlockRendererProps): JSX.Element {
  const { block } = props;
  const interactive = props.interactive !== false;
  return (
    <div className="course-block">
      {renderBlock(block, interactive, props)}
    </div>
  );
}

function renderBlock(block: CourseBlock, interactive: boolean, props: BlockRendererProps): JSX.Element {
  switch (block.type) {
    case 'heading': return <Heading block={block} />;
    case 'text': return <Markdown md={block.markdown} />;
    case 'image': return <ImageView block={block} />;
    case 'video': return <VideoView block={block} interactive={interactive} />;
    case 'audio': return <AudioView block={block} interactive={interactive} />;
    case 'embed': return <EmbedView block={block} interactive={interactive} />;
    case 'callout': return <CalloutView block={block} />;
    case 'quote': return <QuoteView block={block} />;
    case 'divider': return <hr style={{ border: 'none', borderTop: '1px solid var(--line-strong)', margin: '10px 0' }} />;
    case 'attachment': return <AttachmentView block={block} interactive={interactive} />;
    case 'accordion': return <AccordionView block={block} interactive={interactive} />;
    case 'columns': return <ColumnsView block={block} />;
    case 'table': return <TableView block={block} />;
    case 'terms': return <TermsView block={block} />;
    case 'checklist': return <ChecklistView block={block} interactive={interactive} props={props} />;
    case 'widget': return <WidgetBlockView block={block} interactive={interactive} studentName={props.studentName} accent={props.accent} />;
  }
}

// ── Eenvoudige blokken ──────────────────────────────────────────────────────

function Heading({ block }: { block: HeadingBlock }) {
  return block.level === 3
    ? <h3 style={{ margin: '10px 0 2px' }}>{block.text}</h3>
    : <h2 style={{ margin: '14px 0 4px' }}>{block.text}</h2>;
}

function Markdown({ md }: { md: string }) {
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
}

const IMAGE_WIDTHS: Record<string, string> = { small: '380px', normal: '680px', wide: '100%' };

function ImageView({ block }: { block: ImageBlock }) {
  if (!block.url) {
    return <p className="hint" style={{ margin: 0 }}>🖼️ (geen afbeelding gekozen)</p>;
  }
  return (
    <figure style={{ maxWidth: IMAGE_WIDTHS[block.size ?? 'normal'], margin: '0 auto' }}>
      <img
        src={block.url}
        alt={block.caption ?? ''}
        loading="lazy"
        style={{ maxWidth: '100%', display: 'block', borderRadius: 'var(--radius-m)', border: '1px solid var(--line)' }}
      />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/** Zet een YouTube/Vimeo-URL om naar een privacy-nette embed-URL. */
export function videoEmbedUrl(url: string): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function VideoView({ block, interactive }: { block: VideoBlock; interactive: boolean }) {
  const src = videoEmbedUrl(block.url);
  if (!src) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <span aria-hidden>🎬</span>
        <div>Deze video-URL wordt niet herkend. Alleen YouTube- en Vimeo-links werken.</div>
      </div>
    );
  }
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span aria-hidden style={{ fontSize: '1.4rem' }}>🎬</span>
        <div>
          <strong>Video{block.caption ? `: ${block.caption}` : ''}</strong>
          <div className="hint" style={{ wordBreak: 'break-all' }}>{block.url}</div>
        </div>
      </div>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <div className="video-frame">
        <iframe
          src={src}
          title={block.caption || 'Ingesloten video'}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

function AudioView({ block, interactive }: { block: AudioBlock; interactive: boolean }) {
  if (!block.url) return <p className="hint" style={{ margin: 0 }}>🎧 (geen audiofragment gekozen)</p>;
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span aria-hidden style={{ fontSize: '1.4rem' }}>🎧</span>
        <strong>Audiofragment{block.caption ? `: ${block.caption}` : ''}</strong>
      </div>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={block.url} style={{ width: '100%' }} aria-label={block.caption || 'Audiofragment'} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

function EmbedView({ block, interactive }: { block: EmbedBlock; interactive: boolean }) {
  const ok = /^https:\/\//i.test((block.url ?? '').trim());
  if (!ok) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <span aria-hidden>🌐</span>
        <div>Dit kader kan niet getoond worden: alleen veilige <code>https://</code>-adressen zijn toegelaten.</div>
      </div>
    );
  }
  if (!interactive) {
    return (
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span aria-hidden style={{ fontSize: '1.4rem' }}>🌐</span>
        <div>
          <strong>{block.title || 'Extern kader'}</strong>
          <div className="hint" style={{ wordBreak: 'break-all' }}>{block.url}</div>
        </div>
      </div>
    );
  }
  return (
    <iframe
      src={block.url.trim()}
      title={block.title || 'Ingesloten inhoud'}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      loading="lazy"
      style={{
        width: '100%', height: block.height, border: '1px solid var(--line)',
        borderRadius: 'var(--radius-m)', background: 'var(--bg-raised)',
      }}
    />
  );
}

const CALLOUT_STYLE: Record<CalloutBlock['kind'], { icon: string; bg: string; border: string; label: string }> = {
  info: { icon: 'ℹ️', bg: 'var(--brand-soft)', border: 'var(--brand)', label: 'Info' },
  tip: { icon: '💡', bg: 'var(--ok-soft)', border: 'var(--ok)', label: 'Tip' },
  warn: { icon: '⚠️', bg: 'var(--warn-soft)', border: 'var(--warn)', label: 'Let op' },
  goal: { icon: '🎯', bg: 'var(--brand-soft)', border: 'var(--brand)', label: 'Leerdoel' },
};

function CalloutView({ block }: { block: CalloutBlock }) {
  const st = CALLOUT_STYLE[block.kind] ?? CALLOUT_STYLE.info;
  return (
    <div
      role="note"
      style={{
        display: 'flex', gap: 11, padding: '13px 16px', borderRadius: 'var(--radius-m)',
        background: st.bg, border: `1px solid color-mix(in srgb, ${st.border} 35%, transparent)`,
      }}
    >
      <span aria-hidden style={{ fontSize: '1.15rem', lineHeight: 1.4 }}>{st.icon}</span>
      <div style={{ minWidth: 0 }}>
        <strong>{block.title || st.label}</strong>
        <div className="md-body" style={{ fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }} />
      </div>
    </div>
  );
}

function QuoteView({ block }: { block: QuoteBlock }) {
  return (
    <blockquote
      style={{
        margin: 0, padding: '12px 18px', borderLeft: '4px solid var(--brand)',
        background: 'var(--bg-sunken)', borderRadius: '0 var(--radius-s) var(--radius-s) 0',
        fontStyle: 'italic', fontSize: '1.05rem',
      }}
    >
      <p style={{ margin: 0 }}>“{block.text}”</p>
      {block.source && (
        <footer style={{ marginTop: 6, fontStyle: 'normal', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          — {block.source}
        </footer>
      )}
    </blockquote>
  );
}

function AttachmentView({ block, interactive }: { block: AttachmentBlock; interactive: boolean }) {
  const inner = (
    <>
      <span aria-hidden style={{ fontSize: '1.5rem' }}>📎</span>
      <span style={{ fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.name || 'bestand'}</span>
      {interactive && <span className="badge badge-brand" style={{ marginLeft: 'auto', flex: 'none' }}>⬇ downloaden</span>}
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px',
    textDecoration: 'none', color: 'var(--text)',
  };
  if (!interactive || !block.dataUrl) {
    return <div className="card" style={style}>{inner}</div>;
  }
  return (
    <a className="card" href={block.dataUrl} download={block.name || 'bestand'} style={style} aria-label={`Bestand downloaden: ${block.name || 'bestand'}`}>
      {inner}
    </a>
  );
}

function AccordionView({ block, interactive }: { block: AccordionBlock; interactive: boolean }) {
  return (
    <div>
      {block.items.map((it) => (
        <details key={it.id} open={!interactive || undefined}>
          <summary>{it.title}</summary>
          <div className="md-body" style={{ fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text) }} />
        </details>
      ))}
    </div>
  );
}

function ColumnsView({ block }: { block: ColumnsBlock }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18 }}>
      <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.left) }} />
      <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.right) }} />
    </div>
  );
}

function TableView({ block }: { block: TableBlock }) {
  const [head, ...rest] = block.rows;
  const body = block.header ? rest : block.rows;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        {block.header && head && (
          <thead>
            <tr>{head.map((cell, i) => <th key={i} scope="col">{cell}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TermsView({ block }: { block: TermsBlock }) {
  return (
    <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
      {block.items.map((it) => (
        <div key={it.id} className="card" style={{ padding: '10px 14px' }}>
          <dt style={{ fontWeight: 750 }}>{it.term}</dt>
          <dd style={{ margin: '2px 0 0', color: 'var(--text-soft)' }}>{it.uitleg}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChecklistView({ block, interactive, props }: { block: ChecklistBlock; interactive: boolean; props: BlockRendererProps }) {
  const checked = props.checkedIds ?? [];
  const done = block.items.filter((it) => checked.includes(it.id)).length;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <strong>{block.title || '✅ Checklist'}</strong>
        <span
          className={`badge ${done === block.items.length && block.items.length > 0 ? 'badge-ok' : 'badge-brand'}`}
          aria-label={`${done} van ${block.items.length} afgevinkt`}
        >
          {done}/{block.items.length}
        </span>
      </div>
      {interactive ? (
        block.items.map((it) => (
          <label key={it.id} className="checkbox-row">
            <input
              type="checkbox"
              checked={checked.includes(it.id)}
              onChange={() => props.onToggleCheck?.(it.id)}
              style={props.accent ? { accentColor: props.accent } : undefined}
            />
            <span style={checked.includes(it.id) ? { color: 'var(--text-soft)' } : undefined}>{it.text}</span>
          </label>
        ))
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {block.items.map((it) => (
            <li key={it.id} style={{ margin: '5px 0' }}>
              <span aria-hidden>{checked.includes(it.id) ? '☑' : '☐'}</span> {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Ingebedde widget (het kroonjuweel) ──────────────────────────────────────

function WidgetBlockView({
  block, interactive, studentName, accent,
}: { block: WidgetBlock; interactive: boolean; studentName?: string; accent?: string }) {
  const widget = block.widgetId ? getWidget(block.widgetId) : undefined;
  let def: WidgetTypeDef | undefined;
  try {
    def = widget ? getTypeDef(widget.type) : undefined;
  } catch {
    def = undefined;
  }

  const name = (studentName ?? '').trim() || 'Anoniem';
  const [attempt, setAttempt] = useState(0);
  const [sub, setSub] = useState<Submission | null>(null);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());
  const bumpedRef = useRef(false);

  // Dezelfde grenzen als de gewone speler: deadline en maximum aantal pogingen.
  const expired = Boolean(
    widget?.settings.expiresAt && Date.now() > new Date(widget.settings.expiresAt).getTime()
  );
  const maxAttempts = widget?.settings.maxAttempts ?? 0;
  const usedAttempts = widget ? getAttemptCount(widget.id, name) : 0;
  const attemptsLeft = maxAttempts > 0 ? Math.max(0, maxAttempts - usedAttempts) : Infinity;

  // Was er (op dit toestel) al eerder een inzending van deze leerling?
  const alreadySubmitted = useMemo(() => {
    if (!widget) return false;
    return getSubmissions(widget.id).some(
      (s) => s.studentName.trim().toLowerCase() === name.toLowerCase()
    );
    // 'attempt' zit erin zodat de badge na "opnieuw proberen" mee ververst
  }, [widget?.id, name, attempt, sub]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!widget || !def) {
    return (
      <div className="callout warn" style={{ marginBottom: 0 }}>
        <span aria-hidden>🧩</span>
        <div>
          <strong>Oefening niet gevonden.</strong><br />
          De oefening hoort bij dit toestel/deze link te reizen — vraag je leerkracht om een nieuwe link.
        </div>
      </div>
    );
  }

  if (!interactive) {
    return (
      <div className="card" style={{ padding: '14px 18px', borderLeft: `4px solid ${accent ?? def.color}` }}>
        <strong>🧩 Oefening: {widget.title}</strong>
        <div className="hint">{def.name} — wordt digitaal gemaakt in de cursus.</div>
        {block.note && <p style={{ margin: '6px 0 0', fontSize: '0.92rem' }}>{block.note}</p>}
      </div>
    );
  }

  const onComplete = (result: PlayerResult) => {
    // exact hetzelfde patroon als PlayerPage: guard tegen dubbel opslaan en
    // tegen lege "afrondingen" zonder inhoud
    if (doneRef.current || !def.hasSubmissions) return;
    if (result.max === 0 && Object.keys(result.answers).length === 0) return;
    doneRef.current = true;
    // poging meetellen, zodat maxAttempts ook via de cursus geldt
    if (!bumpedRef.current) {
      bumpedRef.current = true;
      bumpAttemptCount(widget.id, name);
    }
    const s: Submission = {
      id: uid(),
      widgetId: widget.id,
      widgetCode: widget.code,
      studentName: name,
      startedAt: startRef.current,
      submittedAt: Date.now(),
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      answers: result.answers,
      itemScores: result.itemScores,
      totalEarned: result.earned,
      totalMax: result.max,
      status: result.hasPending ? 'submitted' : 'graded',
    };
    saveSubmission(s);
    setSub(s);
  };

  const retry = () => {
    if (expired || attemptsLeft <= 0) return;
    doneRef.current = false;
    bumpedRef.current = false;
    startRef.current = Date.now();
    setSub(null);
    setAttempt((a) => a + 1);
  };

  const hasPending = sub?.itemScores
    ? Object.values(sub.itemScores).some((s) => s.mode === 'pending')
    : false;
  const showScore = widget.settings.showScore && !!sub && sub.totalMax > 0;

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${accent ?? def.color}`,
        ['--player-accent' as string]: widget.settings.accentColor,
      } as React.CSSProperties}
    >
      <div
        style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'var(--bg-sunken)',
          borderRadius: 'var(--radius-m) var(--radius-m) 0 0',
        }}
      >
        <span aria-hidden style={{ fontSize: '1.5rem' }}>{def.icon}</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <strong>🧩 Oefening: {widget.title}</strong>
          <div className="hint" style={{ marginTop: 0 }}>{def.name} — {def.tagline}</div>
        </div>
        {alreadySubmitted && !sub && (
          <span className="badge badge-ok" title="Er staat al een inzending met jouw naam op dit toestel">
            ✔ eerder ingediend
          </span>
        )}
      </div>
      {block.note && (
        <p style={{ margin: 0, padding: '10px 18px 0', color: 'var(--text-soft)', fontSize: '0.92rem' }}>
          💬 {block.note}
        </p>
      )}
      <div style={{ padding: '16px 18px' }}>
        {expired ? (
          <div className="callout warn" style={{ marginBottom: 0 }}>
            <span aria-hidden>⏰</span>
            <div>Deze oefening is afgesloten — de deadline is verstreken.</div>
          </div>
        ) : !sub && attemptsLeft <= 0 ? (
          <div className="callout" style={{ marginBottom: 0 }}>
            <span aria-hidden>✋</span>
            <div>
              Je gebruikte al je {maxAttempts} poging{maxAttempts === 1 ? '' : 'en'} voor deze oefening.
              {alreadySubmitted && ' Je eerdere inzending is bewaard.'}
            </div>
          </div>
        ) : (
          <def.Player key={attempt} widget={widget} studentName={name} preview={false} onComplete={onComplete} />
        )}
        {sub && (
          <div
            role="status"
            style={{
              marginTop: 14, padding: '12px 16px', borderRadius: 'var(--radius-m)',
              background: 'var(--ok-soft)', border: '1px solid color-mix(in srgb, var(--ok) 35%, transparent)',
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>✔ Ingediend — goed gedaan!</strong>
              {showScore && (
                <div style={{ fontSize: '0.92rem' }}>
                  Score: {sub.totalEarned}/{sub.totalMax} ({pct(sub.totalEarned, sub.totalMax)}%)
                </div>
              )}
              {hasPending && (
                <div style={{ fontSize: '0.88rem', color: 'var(--text-soft)' }}>
                  Open vragen worden nog door je leerkracht bekeken.
                </div>
              )}
            </div>
            {!expired && attemptsLeft > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={retry}>
                ↺ Opnieuw proberen{maxAttempts > 0 && ` (nog ${attemptsLeft})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
