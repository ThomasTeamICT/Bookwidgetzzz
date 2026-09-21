// ── Bestaand materiaal verwerken (/importeren) ──────────────────────────────
//
// De meeste leerkrachten beginnen niet bij nul: er ligt al een Word-document,
// een pdf of een oude cursus. Deze pagina is de brug. Ze haalt de tekst uit
// wat je erin gooit, laat je die nalezen en aanpassen, en biedt dan vier
// duidelijke vervolgstappen: cursus met AI, oefeningen met AI, cursus zonder
// AI, of — bij een Boosterz-bestand — meteen importeren.
//
// Alles gebeurt op dit toestel. Pas wanneer je zelf voor een AI-stap kiest,
// vertrekt de tekst naar je gekozen AI-aanbieder.

import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  extractFromFile, fromPastedText, ImportError, IMPORT_ACCEPT, MAX_COMFORT_CHARS,
  markdownToCourse, saveImportedCourse, saveImportedPack, saveImportedWidget,
} from '../lib/importers';
import type { ExtractedSource } from '../lib/importers';
import { saveCourse } from '../lib/courses';
import { setHandoff } from '../lib/handoff';
import { getCurricula } from '../lib/curriculum';
import { EmptyState, Field, useToast } from '../components/ui';
import { uid } from '../lib/utils';

interface SourceItem extends ExtractedSource {
  key: string;
  /** Samenvatting nadat een json-bron geïmporteerd is. */
  imported?: string;
  /** Waar je naartoe kan na die import. */
  importedTo?: { label: string; to: string };
}

const KIND_LABEL: Record<ExtractedSource['kind'], string> = {
  text: '📄 tekst',
  widget: '🧩 widget',
  pack: '📦 pakket',
  course: '📘 cursus',
};

export function ImportPage() {
  const toast = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<SourceItem[]>([]);
  const [paste, setPaste] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [curriculumId, setCurriculumId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const curricula = useMemo(() => getCurricula(), []);

  const patch = (key: string, next: Partial<SourceItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...next } : it)));

  const remove = (key: string) => setItems((list) => list.filter((it) => it.key !== key));

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    let added = 0;
    for (const file of files) {
      setBusy(file.name);
      setStatus(`“${file.name}” wordt gelezen…`);
      try {
        const src = await extractFromFile(file);
        setItems((list) => [...list, { ...src, key: uid() }]);
        added++;
        setStatus(`“${file.name}” is ingelezen.`);
      } catch (e) {
        const msg = e instanceof ImportError ? e.message : `“${file.name}” kon niet gelezen worden.`;
        setStatus(msg);
        toast(msg, 'err');
      }
    }
    setBusy(null);
    if (added > 0) toast(`${added} ${added === 1 ? 'bron' : 'bronnen'} toegevoegd`, 'ok');
  }

  function addPaste() {
    try {
      const src = fromPastedText(paste, pasteTitle.trim() || 'Geplakte tekst');
      setItems((list) => [...list, { ...src, key: uid() }]);
      setPaste('');
      setPasteTitle('');
      setStatus('De geplakte tekst is toegevoegd.');
      toast('Tekst toegevoegd', 'ok');
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'De tekst kon niet verwerkt worden.';
      setStatus(msg);
      toast(msg, 'err');
    }
  }

  // ── Vervolgstappen ────────────────────────────────────────────────────────

  function toHandoff(item: SourceItem, target: 'cursus' | 'studio') {
    const source = item.text.trim();
    if (!source) {
      toast('Er staat nog geen tekst in deze bron.', 'err');
      return;
    }
    const ok = setHandoff({
      source,
      title: item.title.trim() || undefined,
      curriculumId: curriculumId || undefined,
      origin: item.origin,
    });
    if (!ok) {
      toast('De tekst kon niet doorgegeven worden (de sessieopslag zit vol). Kopieer ze zelf naar de AI-pagina.', 'err');
      return;
    }
    navigate(target === 'cursus' ? '/cursussen?ai=nieuw' : '/ai-studio');
  }

  function toCourseWithoutAI(item: SourceItem) {
    const text = item.text.trim();
    if (!text) {
      toast('Er staat nog geen tekst in deze bron.', 'err');
      return;
    }
    const course = markdownToCourse(item.text, item.title.trim() || item.origin);
    if (curriculumId) course.curriculumId = curriculumId;
    saveCourse(course);
    const sections = course.chapters.reduce((n, ch) => n + ch.sections.length, 0);
    toast(
      `Cursus “${course.title}” aangemaakt — ${course.chapters.length} hoofdstuk${course.chapters.length === 1 ? '' : 'ken'}, ${sections} sectie${sections === 1 ? '' : 's'}`,
      'ok'
    );
    navigate(`/cursus/bewerk/${course.id}`);
  }

  function importJson(item: SourceItem) {
    try {
      if (item.kind === 'widget' && item.widget) {
        const saved = saveImportedWidget(item.widget);
        patch(item.key, {
          imported: `“${saved.title}” staat nu bij je widgets (code ${saved.code}).`,
          importedTo: { label: '✏️ Openen in de editor', to: `/bewerk/${saved.id}` },
        });
        toast(`“${saved.title}” geïmporteerd`, 'ok');
        return;
      }
      if (item.kind === 'pack' && item.pack) {
        const res = saveImportedPack(item.pack);
        const n = res.widgets.length;
        patch(item.key, {
          imported:
            `${n} widget${n === 1 ? '' : 's'} geïmporteerd in de map “${res.folderName}”.` +
            (res.skipped > 0 ? ` ${res.skipped} onderdeel${res.skipped === 1 ? '' : 'en'} overgeslagen: onbekend widgettype.` : ''),
          importedTo: { label: '🧩 Naar mijn widgets', to: '/widgets' },
        });
        toast(`${n} widget${n === 1 ? '' : 's'} geïmporteerd`, 'ok');
        return;
      }
      if (item.kind === 'course' && item.course) {
        const course = saveImportedCourse(item.course);
        patch(item.key, {
          imported: `Cursus “${course.title}” staat nu bij je cursussen.`,
          importedTo: { label: '📘 Cursus openen', to: `/cursus/bewerk/${course.id}` },
        });
        toast(`Cursus “${course.title}” geïmporteerd`, 'ok');
      }
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'Importeren is mislukt.';
      toast(msg, 'err');
      setStatus(msg);
    }
  }

  // ── Weergave ──────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📄 Bestaand materiaal verwerken</h1>
          <p className="sub">
            Je Word-document, pdf of losse tekst wordt hier leesbare tekst — en daarna een cursus of oefeningen.
          </p>
        </div>
        <div className="page-head-actions">
          <Link to="/widgets" className="btn btn-ghost">← Mijn widgets</Link>
        </div>
      </div>

      <div className="callout" style={{ marginBottom: 18 }}>
        <strong>Wat kan hier binnen?</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li><strong>.docx</strong> (Word), <strong>.pdf</strong>, <strong>.md</strong>, <strong>.txt</strong> en <strong>.html</strong> → de tekst eruit.</li>
          <li><strong>.json</strong> uit Boosterz → een widget, een vakgroeppakket of een cursus, meteen te importeren.</li>
        </ul>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          ⚠️ Een <strong>gescande</strong> pdf (foto’s van pagina’s) bevat geen tekstlaag: daar komt niets uit.
          Gebruik dan het originele bestand of plak de tekst hieronder zelf.
        </p>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          🔒 Het lezen gebeurt volledig op dit toestel. Er vertrekt <strong>niets</strong> naar het internet, behalve
          de tekst die je zelf naar een AI-stap stuurt — die gaat dan naar je gekozen AI-aanbieder.
        </p>
      </div>

      {/* ── Bronnen toevoegen ── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--line-strong)'}`,
            background: dragOver ? 'var(--brand-soft)' : 'transparent',
            borderRadius: 12,
            padding: '20px 16px',
            textAlign: 'center',
            display: 'grid',
            gap: 8,
            justifyItems: 'center',
          }}
        >
          <span aria-hidden style={{ fontSize: '1.8rem' }}>📥</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            aria-busy={busy !== null}
          >
            {busy ? `⏳ ${busy} lezen…` : 'Bestanden kiezen…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <span className="hint">
            Of sleep je bestanden hierheen. Meerdere tegelijk mag — elke bron krijgt hieronder een eigen kaart.
          </span>
        </div>

        <p className="hint" role="status" aria-live="polite" style={{ margin: '10px 0 0', minHeight: '1.2em' }}>
          {status}
        </p>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem' }}>
            ✍️ Of plak je tekst rechtstreeks
          </summary>
          <div style={{ paddingTop: 10 }}>
            <Field label="Titel (optioneel)">
              <input
                className="input"
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder='bv. "Hoofdstuk 3 — de waterkringloop"'
                style={{ maxWidth: 360 }}
              />
            </Field>
            <Field label="Tekst" hint="Een hoofdstuk, een samenvatting, een artikel … markdown mag ook.">
              <textarea
                className="textarea"
                rows={6}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Plak hier je tekst…"
              />
            </Field>
            <button className="btn btn-primary" onClick={addPaste} disabled={!paste.trim()}>
              + Tekst toevoegen als bron
            </button>
          </div>
        </details>
      </div>

      {/* ── Leerplan dat meereist naar de AI-stappen ── */}
      {items.some((it) => it.kind === 'text') && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <Field
            label="Leerplan (optioneel)"
            hint="Wordt meegegeven aan de AI-stappen hieronder, zodat vragen en secties meteen aan de juiste leerplandoelen hangen."
          >
            {curricula.length > 0 ? (
              <select
                className="select"
                value={curriculumId}
                onChange={(e) => setCurriculumId(e.target.value)}
                style={{ maxWidth: 460 }}
              >
                <option value="">Geen leerplan koppelen</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {c.subject}, {c.level} ({c.goals.length} doelen)
                  </option>
                ))}
              </select>
            ) : (
              <span className="hint">
                Je hebt nog geen leerplan. <Link to="/leerplannen">Voeg er eerst een toe</Link> als je met
                leerplandoelen wil werken — het hoeft niet.
              </span>
            )}
          </Field>
        </div>
      )}

      {/* ── De bronnen ── */}
      {items.length === 0 ? (
        <EmptyState icon="📚" title="Nog geen bronmateriaal">
          <p>
            Kies hierboven een bestand of plak je tekst. Je ziet dan eerst wat eruit komt — pas daarna beslis
            jij wat ermee gebeurt.
          </p>
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {items.map((item) => (
            <SourceCard
              key={item.key}
              item={item}
              onChange={(next) => patch(item.key, next)}
              onRemove={() => remove(item.key)}
              onCourseAI={() => toHandoff(item, 'cursus')}
              onWidgetsAI={() => toHandoff(item, 'studio')}
              onCourse={() => toCourseWithoutAI(item)}
              onImport={() => importJson(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Eén bron ────────────────────────────────────────────────────────────────

function SourceCard({
  item, onChange, onRemove, onCourseAI, onWidgetsAI, onCourse, onImport,
}: {
  item: SourceItem;
  onChange: (next: Partial<SourceItem>) => void;
  onRemove: () => void;
  onCourseAI: () => void;
  onWidgetsAI: () => void;
  onCourse: () => void;
  onImport: () => void;
}) {
  const counterId = `teller-${item.key}`;
  const tooLong = item.text.length > MAX_COMFORT_CHARS;
  const empty = item.text.trim() === '';

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Field label="Titel van deze bron">
            <input
              className="input"
              type="text"
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </Field>
          <p className="hint" style={{ margin: '-8px 0 0' }}>
            <span className="badge badge-brand">{KIND_LABEL[item.kind]}</span>{' '}
            uit <strong>{item.origin}</strong> · {item.sourceLabel}
          </p>
        </div>
        <button
          className="btn btn-sm btn-quiet"
          style={{ color: 'var(--err)' }}
          onClick={onRemove}
          aria-label={`Bron “${item.title}” verwijderen uit deze lijst`}
        >
          ✕ Verwijderen
        </button>
      </div>

      {item.warnings.length > 0 && (
        <div className="callout warn" style={{ margin: '12px 0' }} role="status">
          {item.warnings.map((w, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>⚠️ {w}</p>
          ))}
        </div>
      )}

      {item.kind === 'text' ? (
        <>
          <Field label="Geëxtraheerde tekst — lees ze even na en pas gerust aan">
            <textarea
              className="textarea"
              rows={10}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              aria-describedby={counterId}
              placeholder="Hier stond geen tekst — typ of plak ze zelf."
            />
          </Field>
          <p
            id={counterId}
            className="hint"
            aria-live="polite"
            style={{ margin: '-8px 0 12px', ...(tooLong ? { color: 'var(--warn)', fontWeight: 600 } : {}) }}
          >
            {item.text.length.toLocaleString('nl-BE')} tekens
            {tooLong && ' — ⚠️ erg lang: knip in kleinere stukken voor een beter resultaat'}
          </p>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Wat wil je hiermee doen?</strong>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ai" onClick={onCourseAI} disabled={empty}>
                ✨ Cursus bouwen met AI
              </button>
              <button className="btn btn-ai" onClick={onWidgetsAI} disabled={empty}>
                ✨ Oefeningen maken met AI
              </button>
              <button className="btn btn-ghost" onClick={onCourse} disabled={empty}>
                📘 Omzetten naar cursus (zonder AI)
              </button>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Zonder AI wordt de opmaak letterlijk gevolgd: <code>#</code> wordt een hoofdstuk,
              <code> ##</code> een sectie, <code> ###</code> een tussenkop; alinea’s, lijsten en tabellen
              worden blokken. Niets verlaat je toestel.
            </p>
            {empty && <p className="hint" style={{ margin: '4px 0 0' }}>Vul eerst tekst in om verder te kunnen.</p>}
          </div>
        </>
      ) : (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <p style={{ margin: '0 0 10px' }}>{describeBundle(item)}</p>
          {item.imported ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-ok">✓ geïmporteerd</span>
              <span>{item.imported}</span>
              {item.importedTo && (
                <Link className="btn btn-sm btn-ghost" to={item.importedTo.to}>{item.importedTo.label}</Link>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={onImport}>📥 Nu importeren</button>
          )}
        </div>
      )}
    </div>
  );
}

function describeBundle(item: SourceItem): string {
  if (item.kind === 'widget' && item.widget) {
    return 'Dit is één widget. Bij het importeren krijgt ze een nieuwe deelcode, zodat ze naast je bestaande widgets kan bestaan.';
  }
  if (item.kind === 'pack' && item.pack) {
    const n = item.pack.widgets.length;
    return `Dit vakgroeppakket bevat ${n} widget${n === 1 ? '' : 's'}${item.pack.meta.auteur ? `, gedeeld door ${item.pack.meta.auteur}` : ''}. Ze komen in een nieuwe map “${item.pack.meta.naam}”.`;
  }
  if (item.kind === 'course' && item.course) {
    const n = item.course.widgets.length;
    return `Dit is een cursusbestand${n ? ` met ${n} meegereisde widget${n === 1 ? '' : 's'}` : ''}. Bestaande widgets met hetzelfde id worden nooit overschreven.`;
  }
  return '';
}
