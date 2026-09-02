// ── Bewerkformulieren per cursusblok-type ───────────────────────────────────
//
// Gebruikt door de cursuseditor (CourseEditorPage). Elk bloktype krijgt hier
// zijn eigen compacte formulier; BLOCK_META levert icoon/naam/uitleg voor
// blokkaarten en het blokkenpalet.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccordionBlock, AttachmentBlock, AudioBlock, CalloutBlock, ChecklistBlock,
  ColumnsBlock, CourseBlock, CourseBlockType, EmbedBlock, HeadingBlock,
  ImageBlock, PdfBlock, QuoteBlock, TableBlock, TermsBlock, TextBlock,
  VideoBlock, WidgetBlock,
} from '../../lib/courseTypes';
import { getWidgets, onStorageChange } from '../../lib/storage';
import { getTypeDef } from '../../widgets/registry';
import { fileToMediaUrl, uid } from '../../lib/utils';
import { mediaSizeForUrl } from '../../lib/mediaStore';
import { pickAndStorePdf } from '../pdf/PdfViewer';
import { deletePdf, formatBytes, getPdf } from '../../lib/pdfStore';
import { pdfReferenceCount } from '../../lib/courses';
import { CheckRow, Field, ImagePicker, useToast } from '../ui';
import { renderMarkdown } from '../../lib/markdown';

// ── Metadata: icoon, naam en één zin uitleg per bloktype ────────────────────

export const BLOCK_META: Record<CourseBlockType, { icon: string; name: string; blurb: string }> = {
  heading: { icon: '🔠', name: 'Tussenkop', blurb: 'Structuur in je pagina met een kop (H2 of H3).' },
  text: { icon: '📝', name: 'Tekst', blurb: 'Alinea’s met eenvoudige opmaak: vet, cursief, lijsten en links.' },
  image: { icon: '🖼️', name: 'Afbeelding', blurb: 'Afbeelding met bijschrift, in drie groottes.' },
  video: { icon: '🎬', name: 'Video', blurb: 'YouTube- of Vimeo-video, afspeelbaar in de cursus.' },
  audio: { icon: '🔊', name: 'Audio', blurb: 'Audiofragment dat je zelf oplaadt (bv. uitspraak of instructie).' },
  pdf: { icon: '📄', name: 'Pdf-document', blurb: 'Toon een pdf rechtstreeks in de cursus — leerlingen bladeren, zoomen en openen hem desnoods in een nieuw tabblad.' },
  embed: { icon: '🌐', name: 'Insluiting', blurb: 'Externe webpagina in een kader: GeoGebra, kaarten, …' },
  callout: { icon: '💡', name: 'Kadertje', blurb: 'Opvallend kader: info, tip, let op of leerdoelen.' },
  quote: { icon: '💬', name: 'Citaat', blurb: 'Citaat met bronvermelding.' },
  divider: { icon: '➖', name: 'Scheidingslijn', blurb: 'Visuele adempauze tussen twee delen.' },
  attachment: { icon: '📎', name: 'Bijlage', blurb: 'Downloadbaar bestand voor je leerlingen.' },
  accordion: { icon: '📂', name: 'Uitklapper', blurb: 'Uitklapbare onderdelen — handig voor extra uitleg.' },
  columns: { icon: '🔳', name: 'Twee kolommen', blurb: 'Twee tekstkolommen naast elkaar, bv. voor vergelijkingen.' },
  table: { icon: '📋', name: 'Tabel', blurb: 'Eenvoudige tabel met optionele kopregel.' },
  terms: { icon: '📖', name: 'Begrippen', blurb: 'Begrippenlijst met term en uitleg.' },
  checklist: { icon: '☑️', name: 'Afvinklijst', blurb: 'Lijstje dat de leerling zelf afvinkt (telt mee in de voortgang).' },
  widget: { icon: '🧩', name: 'Widget', blurb: 'Een oefening of toets uit WidgetFabriek, inline afspeelbaar.' },
};

/** Volgorde voor het blokkenpalet. */
export const PALETTE_ORDER: CourseBlockType[] = [
  'text', 'heading', 'image', 'video', 'audio', 'pdf', 'callout', 'quote', 'widget',
  'checklist', 'terms', 'accordion', 'columns', 'table', 'embed', 'attachment', 'divider',
];

/** Kopie van een blok met verse ids — ook voor geneste items. */
export function duplicateBlock(block: CourseBlock): CourseBlock {
  const copy = { ...block, id: uid() } as CourseBlock;
  switch (copy.type) {
    case 'accordion':
      return { ...copy, items: copy.items.map((it) => ({ ...it, id: uid() })) };
    case 'terms':
      return { ...copy, items: copy.items.map((it) => ({ ...it, id: uid() })) };
    case 'checklist':
      return { ...copy, items: copy.items.map((it) => ({ ...it, id: uid() })) };
    default:
      // 'pdf' kopieert bewust hetzelfde pdfId mee: het is maar een verwijzing
      // naar de opslag, beide blokken tonen dan hetzelfde bestand.
      return copy;
  }
}

// ── Hulpjes ─────────────────────────────────────────────────────────────────

type OnChange = (block: CourseBlock) => void;

const MD_HINT = 'opmaak: **vet**, *cursief*, - lijst, [link](https://…)';

function MarkdownPreview({ md }: { md: string }) {
  if (!md.trim()) return null;
  return (
    <div
      style={{
        marginTop: 8, padding: '10px 12px', border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-s)', background: 'var(--bg-sunken)',
      }}
    >
      <span className="hint" style={{ display: 'block', marginBottom: 4 }}>Voorbeeld:</span>
      <div className="md-body" style={{ fontSize: '0.92rem' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
    </div>
  );
}

function moveItem<T>(arr: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  const [x] = copy.splice(i, 1);
  copy.splice(j, 0, x);
  return copy;
}

/** Grootte van een bestand in leesbare vorm: uit de medialaag (blob:-URL) of geschat (data-URL). */
function dataUrlSize(url: string): string {
  const stored = mediaSizeForUrl(url);
  const bytes = stored ?? (url.startsWith('data:') ? Math.round(url.length * 0.75) : 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// ── Het schakelpunt ─────────────────────────────────────────────────────────

export function BlockEditor({ block, onChange }: { block: CourseBlock; onChange: OnChange }) {
  switch (block.type) {
    case 'heading': return <HeadingEditor b={block} onChange={onChange} />;
    case 'text': return <TextEditor b={block} onChange={onChange} />;
    case 'image': return <ImageEditor b={block} onChange={onChange} />;
    case 'video': return <VideoEditor b={block} onChange={onChange} />;
    case 'audio': return <AudioEditor b={block} onChange={onChange} />;
    case 'pdf': return <PdfBlockEditor b={block} onChange={onChange} />;
    case 'embed': return <EmbedEditor b={block} onChange={onChange} />;
    case 'callout': return <CalloutEditor b={block} onChange={onChange} />;
    case 'quote': return <QuoteEditor b={block} onChange={onChange} />;
    case 'divider': return <p className="hint" style={{ margin: 0 }}>Geen instellingen — dit blok toont een scheidingslijn.</p>;
    case 'attachment': return <AttachmentEditor b={block} onChange={onChange} />;
    case 'accordion': return <AccordionEditor b={block} onChange={onChange} />;
    case 'columns': return <ColumnsEditor b={block} onChange={onChange} />;
    case 'table': return <TableEditor b={block} onChange={onChange} />;
    case 'terms': return <TermsEditor b={block} onChange={onChange} />;
    case 'checklist': return <ChecklistEditor b={block} onChange={onChange} />;
    case 'widget': return <WidgetBlockEditor b={block} onChange={onChange} />;
  }
}

// ── Eenvoudige blokken ──────────────────────────────────────────────────────

function HeadingEditor({ b, onChange }: { b: HeadingBlock; onChange: OnChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        className="input"
        style={{ flex: 1, fontWeight: 700 }}
        value={b.text}
        placeholder="Tekst van de kop"
        aria-label="Tekst van de kop"
        onChange={(e) => onChange({ ...b, text: e.target.value })}
      />
      <select
        className="select input-sm"
        style={{ width: 130 }}
        value={b.level}
        aria-label="Niveau van de kop"
        onChange={(e) => onChange({ ...b, level: e.target.value === '3' ? 3 : 2 })}
      >
        <option value={2}>H2 — groot</option>
        <option value={3}>H3 — klein</option>
      </select>
    </div>
  );
}

function TextEditor({ b, onChange }: { b: TextBlock; onChange: OnChange }) {
  return (
    <div>
      <textarea
        className="textarea"
        rows={5}
        value={b.markdown}
        placeholder="Schrijf hier je tekst…"
        aria-label="Tekst van het blok"
        onChange={(e) => onChange({ ...b, markdown: e.target.value })}
      />
      <span className="hint">{MD_HINT}</span>
      <MarkdownPreview md={b.markdown} />
    </div>
  );
}

function ImageEditor({ b, onChange }: { b: ImageBlock; onChange: OnChange }) {
  return (
    <div>
      <ImagePicker value={b.url || undefined} onChange={(url) => onChange({ ...b, url: url ?? '' })} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Bijschrift (optioneel)">
          <input
            className="input input-sm"
            style={{ minWidth: 220 }}
            value={b.caption ?? ''}
            onChange={(e) => onChange({ ...b, caption: e.target.value || undefined })}
          />
        </Field>
        <Field label="Grootte">
          <select
            className="select input-sm"
            value={b.size ?? 'normal'}
            aria-label="Grootte van de afbeelding"
            onChange={(e) => onChange({ ...b, size: e.target.value as ImageBlock['size'] })}
          >
            <option value="small">Klein</option>
            <option value="normal">Normaal</option>
            <option value="wide">Breed</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function VideoEditor({ b, onChange }: { b: VideoBlock; onChange: OnChange }) {
  return (
    <div>
      <Field label="Videolink" hint="Plak een YouTube- of Vimeo-adres, bv. https://www.youtube.com/watch?v=…">
        <input
          className="input"
          type="url"
          value={b.url}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => onChange({ ...b, url: e.target.value })}
        />
      </Field>
      <Field label="Bijschrift (optioneel)">
        <input
          className="input input-sm"
          value={b.caption ?? ''}
          onChange={(e) => onChange({ ...b, caption: e.target.value || undefined })}
        />
      </Field>
    </div>
  );
}

function AudioEditor({ b, onChange }: { b: AudioBlock; onChange: OnChange }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      {b.url ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <audio controls src={b.url} style={{ maxWidth: '100%' }} />
          <span className="hint">{dataUrlSize(b.url)}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...b, url: '' })}>Verwijderen</button>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()}>
            🔊 Audiobestand kiezen…
          </button>
          <span className="hint" style={{ display: 'block', marginTop: 4 }}>
            Kleine bestanden werken het best — alles wordt in de browser bewaard.
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 8 * 1024 * 1024) {
            toast('Let op: dit audiobestand is groter dan 8 MB. Het past wel, maar de draagbare link wordt er onbruikbaar groot van.', 'err');
          }
          onChange({ ...b, url: await fileToMediaUrl(f) });
          e.target.value = '';
        }}
      />
      <Field label="Bijschrift (optioneel)">
        <input
          className="input input-sm"
          value={b.caption ?? ''}
          onChange={(e) => onChange({ ...b, caption: e.target.value || undefined })}
        />
      </Field>
    </div>
  );
}

const PDF_HEIGHTS = [420, 560, 720];

function PdfBlockEditor({ b, onChange }: { b: PdfBlock; onChange: OnChange }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Grootte/naam van de geüploade pdf tonen (die staan in IndexedDB, niet in het blok).
  const [stored, setStored] = useState<{ name: string; size: number } | 'weg' | null>(null);
  useEffect(() => {
    let alive = true;
    if (!b.pdfId) {
      setStored(null);
      return;
    }
    getPdf(b.pdfId).then((rec) => {
      if (alive) setStored(rec ? { name: rec.name, size: rec.blob.size } : 'weg');
    });
    return () => { alive = false; };
  }, [b.pdfId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    const res = await pickAndStorePdf(f);
    setBusy(false);
    if ('error' in res) {
      toast(res.error, 'err');
      return;
    }
    // Bij "Vervangen": de vorige upload opruimen (fire-and-forget) — maar
    // alleen als dit blok de laatste verwijzing is. Dupliceren (blok, cursus,
    // widget) deelt bewust hetzelfde pdfId, dus een duplicaat mag het bestand
    // niet kwijtraken.
    if (b.pdfId && pdfReferenceCount(b.pdfId) <= 1) void deletePdf(b.pdfId);
    onChange({ ...b, pdfId: res.pdfId, name: res.name, url: undefined });
  };

  const removeUpload = () => {
    // Zelfde regel als bij "Vervangen": de blob alleen wissen als niets
    // anders er nog naar verwijst; anders enkel de verwijzing loskoppelen.
    if (b.pdfId && pdfReferenceCount(b.pdfId) <= 1) void deletePdf(b.pdfId);
    onChange({ ...b, pdfId: undefined, name: undefined });
  };

  const height = b.height ?? 560;
  return (
    <div>
      {b.pdfId ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📄 {b.name || (typeof stored === 'object' && stored?.name) || 'pdf-bestand'}
            {typeof stored === 'object' && stored && <span className="hint"> ({formatBytes(stored.size)})</span>}
          </span>
          {stored === 'weg' && (
            <span className="hint" style={{ color: 'var(--err)' }}>⚠ niet gevonden op dit toestel</span>
          )}
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Bezig…' : 'Vervangen…'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={removeUpload}>Verwijderen</button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
              📄 {busy ? 'Bezig met bewaren…' : 'Pdf-bestand kiezen…'}
            </button>
            <span className="hint" style={{ marginLeft: 8 }}>of gebruik een URL:</span>
          </div>
          <Field label="Pdf-URL" hint="Een openbaar https-adres dat rechtstreeks naar een pdf verwijst.">
            <input
              className="input"
              type="url"
              value={b.url ?? ''}
              placeholder="https://…/document.pdf"
              onChange={(e) => onChange({ ...b, url: e.target.value || undefined })}
            />
          </Field>
        </>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} aria-label="Pdf-bestand kiezen" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Bijschrift (optioneel)">
          <input
            className="input input-sm"
            style={{ minWidth: 220 }}
            value={b.caption ?? ''}
            onChange={(e) => onChange({ ...b, caption: e.target.value || undefined })}
          />
        </Field>
        <Field label="Hoogte">
          <select
            className="select input-sm"
            value={height}
            aria-label="Hoogte van de pdf-weergave"
            onChange={(e) => onChange({ ...b, height: parseInt(e.target.value) || 560 })}
          >
            {!PDF_HEIGHTS.includes(height) && <option value={height}>Aangepast ({height} px)</option>}
            <option value={420}>Laag (420 px)</option>
            <option value={560}>Normaal (560 px)</option>
            <option value={720}>Hoog (720 px)</option>
          </select>
        </Field>
      </div>
      <span className="hint" style={{ display: 'block', marginTop: 4 }}>
        Een geüploade pdf staat alleen op dit toestel — hij reist <strong>niet</strong> mee met de deellink.
        Voor cursussen die je deelt gebruik je best een pdf-URL (bv. van je schoolwebsite of leeromgeving).
      </span>
    </div>
  );
}

function EmbedEditor({ b, onChange }: { b: EmbedBlock; onChange: OnChange }) {
  const insecure = b.url.trim() !== '' && !/^https:\/\//i.test(b.url.trim());
  return (
    <div>
      <Field label="Webadres om in te sluiten" hint="Alleen https-adressen — bv. een GeoGebra-applet of een kaart.">
        <input
          className="input"
          type="url"
          value={b.url}
          placeholder="https://…"
          onChange={(e) => onChange({ ...b, url: e.target.value })}
        />
      </Field>
      {insecure && (
        <p className="hint" style={{ color: 'var(--err)', marginTop: -6 }}>
          ⚠ Dit adres begint niet met https:// en zal bij de leerling niet getoond worden.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Hoogte (px)">
          <input
            className="input input-sm"
            type="number"
            min={100}
            max={1200}
            style={{ maxWidth: 110 }}
            value={b.height}
            onChange={(e) => onChange({ ...b, height: Math.max(100, Math.min(1200, parseInt(e.target.value) || 420)) })}
          />
        </Field>
        <Field label="Titel (voor toegankelijkheid)">
          <input
            className="input input-sm"
            style={{ minWidth: 220 }}
            value={b.title ?? ''}
            placeholder="bv. GeoGebra: eerstegraadsfuncties"
            onChange={(e) => onChange({ ...b, title: e.target.value || undefined })}
          />
        </Field>
      </div>
    </div>
  );
}

const CALLOUT_KINDS: { value: CalloutBlock['kind']; label: string }[] = [
  { value: 'info', label: 'ℹ️ Info' },
  { value: 'tip', label: '💡 Tip' },
  { value: 'warn', label: '⚠️ Let op' },
  { value: 'goal', label: '🎯 Leerdoelen' },
];

function CalloutEditor({ b, onChange }: { b: CalloutBlock; onChange: OnChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Soort">
          <select
            className="select input-sm"
            value={b.kind}
            aria-label="Soort kadertje"
            onChange={(e) => onChange({ ...b, kind: e.target.value as CalloutBlock['kind'] })}
          >
            {CALLOUT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Titel (optioneel)">
          <input
            className="input input-sm"
            style={{ minWidth: 220 }}
            value={b.title ?? ''}
            onChange={(e) => onChange({ ...b, title: e.target.value || undefined })}
          />
        </Field>
      </div>
      <Field label="Tekst">
        <textarea
          className="textarea"
          rows={3}
          value={b.text}
          onChange={(e) => onChange({ ...b, text: e.target.value })}
        />
      </Field>
    </div>
  );
}

function QuoteEditor({ b, onChange }: { b: QuoteBlock; onChange: OnChange }) {
  return (
    <div>
      <Field label="Citaat">
        <textarea
          className="textarea"
          rows={2}
          value={b.text}
          placeholder="De tekst van het citaat…"
          onChange={(e) => onChange({ ...b, text: e.target.value })}
        />
      </Field>
      <Field label="Bron (optioneel)">
        <input
          className="input input-sm"
          value={b.source ?? ''}
          placeholder="bv. Stefan Hertmans, Oorlog en terpentijn"
          onChange={(e) => onChange({ ...b, source: e.target.value || undefined })}
        />
      </Field>
    </div>
  );
}

function AttachmentEditor({ b, onChange }: { b: AttachmentBlock; onChange: OnChange }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      {b.dataUrl ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <span>📎 {b.name || 'bestand'} <span className="hint">({dataUrlSize(b.dataUrl)})</span></span>
          <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...b, dataUrl: '' })}>Verwijderen</button>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()}>
            📎 Bestand kiezen…
          </button>
          <span className="hint" style={{ display: 'block', marginTop: 4 }}>
            Voor grote bestanden werkt een link (bv. naar je schoolcloud) in een tekstblok beter.
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 4 * 1024 * 1024) {
            toast('Let op: dit bestand is groter dan 4 MB. Het past wel, maar in een draagbare link of exportbestand weegt het zwaar.', 'err');
          }
          onChange({ ...b, dataUrl: await fileToMediaUrl(f), name: b.name.trim() || f.name });
          e.target.value = '';
        }}
      />
      <Field label="Naam van de bijlage">
        <input
          className="input input-sm"
          value={b.name}
          placeholder="bv. werkblad-hoofdstuk-2.pdf"
          onChange={(e) => onChange({ ...b, name: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ── Blokken met lijstjes ────────────────────────────────────────────────────

function AccordionEditor({ b, onChange }: { b: AccordionBlock; onChange: OnChange }) {
  const setItems = (items: AccordionBlock['items']) => onChange({ ...b, items });
  return (
    <div>
      {b.items.map((it, i) => (
        <div key={it.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input
              className="input input-sm"
              style={{ flex: 1, fontWeight: 600, minWidth: 0 }}
              value={it.title}
              placeholder={`Titel van onderdeel ${i + 1}`}
              aria-label={`Titel van onderdeel ${i + 1}`}
              onChange={(e) => setItems(b.items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
            />
            <button className="btn btn-quiet btn-sm btn-icon" disabled={i === 0} aria-label="Onderdeel omhoog"
              onClick={() => setItems(moveItem(b.items, i, -1))}>↑</button>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={i === b.items.length - 1} aria-label="Onderdeel omlaag"
              onClick={() => setItems(moveItem(b.items, i, 1))}>↓</button>
            <button className="btn btn-quiet btn-sm btn-icon" disabled={b.items.length <= 1} aria-label="Onderdeel verwijderen"
              onClick={() => setItems(b.items.filter((x) => x.id !== it.id))}>🗑</button>
          </div>
          <textarea
            className="textarea"
            rows={2}
            value={it.text}
            placeholder="Tekst die uitklapt…"
            aria-label={`Tekst van onderdeel ${i + 1}`}
            onChange={(e) => setItems(b.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
          />
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={() => setItems([...b.items, { id: uid(), title: '', text: '' }])}>
        + Onderdeel
      </button>
    </div>
  );
}

function ColumnsEditor({ b, onChange }: { b: ColumnsBlock; onChange: OnChange }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Linkerkolom">
          <textarea
            className="textarea"
            rows={5}
            value={b.left}
            onChange={(e) => onChange({ ...b, left: e.target.value })}
          />
        </Field>
        <Field label="Rechterkolom">
          <textarea
            className="textarea"
            rows={5}
            value={b.right}
            onChange={(e) => onChange({ ...b, right: e.target.value })}
          />
        </Field>
      </div>
      <span className="hint">{MD_HINT}</span>
    </div>
  );
}

function TableEditor({ b, onChange }: { b: TableBlock; onChange: OnChange }) {
  const rows = b.rows;
  const cols = rows[0]?.length ?? 0;
  const setRows = (r: string[][]) => onChange({ ...b, rows: r });
  const setCell = (ri: number, ci: number, v: string) =>
    setRows(rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)));

  return (
    <div>
      <CheckRow checked={b.header} onChange={(v) => onChange({ ...b, header: v })} label="Eerste rij is een kopregel" />
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(110px, 1fr)) 34px`, gap: 4, minWidth: cols * 114 + 40 }}>
          {cols > 1 && (
            <>
              {Array.from({ length: cols }, (_, ci) => (
                <button
                  key={`delcol-${ci}`}
                  className="btn btn-quiet btn-sm"
                  style={{ justifySelf: 'center' }}
                  aria-label={`Kolom ${ci + 1} verwijderen`}
                  title="Kolom verwijderen"
                  onClick={() => setRows(rows.map((r) => r.filter((_, j) => j !== ci)))}
                >
                  ✕
                </button>
              ))}
              <span aria-hidden />
            </>
          )}
          {rows.map((r, ri) => (
            <React.Fragment key={ri}>
              {r.map((cell, ci) => (
                <input
                  key={ci}
                  className="input input-sm"
                  style={b.header && ri === 0 ? { fontWeight: 700 } : undefined}
                  value={cell}
                  aria-label={`Cel rij ${ri + 1}, kolom ${ci + 1}`}
                  onChange={(e) => setCell(ri, ci, e.target.value)}
                />
              ))}
              <button
                className="btn btn-quiet btn-sm btn-icon"
                disabled={rows.length <= 1}
                aria-label={`Rij ${ri + 1} verwijderen`}
                title="Rij verwijderen"
                onClick={() => setRows(rows.filter((_, i) => i !== ri))}
              >
                🗑
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setRows([...rows, Array(Math.max(cols, 1)).fill('')])}>+ Rij</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setRows(rows.map((r) => [...r, '']))}>+ Kolom</button>
      </div>
    </div>
  );
}

function TermsEditor({ b, onChange }: { b: TermsBlock; onChange: OnChange }) {
  const setItems = (items: TermsBlock['items']) => onChange({ ...b, items });
  return (
    <div>
      {b.items.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <input
            className="input input-sm"
            style={{ width: '32%', fontWeight: 600, minWidth: 0 }}
            value={it.term}
            placeholder="Term"
            aria-label={`Term ${i + 1}`}
            onChange={(e) => setItems(b.items.map((x) => (x.id === it.id ? { ...x, term: e.target.value } : x)))}
          />
          <input
            className="input input-sm"
            style={{ flex: 1, minWidth: 0 }}
            value={it.uitleg}
            placeholder="Uitleg"
            aria-label={`Uitleg bij term ${i + 1}`}
            onChange={(e) => setItems(b.items.map((x) => (x.id === it.id ? { ...x, uitleg: e.target.value } : x)))}
          />
          <button className="btn btn-quiet btn-sm btn-icon" disabled={b.items.length <= 1} aria-label={`Term ${i + 1} verwijderen`}
            onClick={() => setItems(b.items.filter((x) => x.id !== it.id))}>🗑</button>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={() => setItems([...b.items, { id: uid(), term: '', uitleg: '' }])}>
        + Begrip
      </button>
    </div>
  );
}

function ChecklistEditor({ b, onChange }: { b: ChecklistBlock; onChange: OnChange }) {
  const setItems = (items: ChecklistBlock['items']) => onChange({ ...b, items });
  return (
    <div>
      <Field label="Titel (optioneel)">
        <input
          className="input input-sm"
          value={b.title ?? ''}
          placeholder="bv. Check jezelf"
          onChange={(e) => onChange({ ...b, title: e.target.value || undefined })}
        />
      </Field>
      {b.items.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <span aria-hidden style={{ color: 'var(--text-faint)' }}>☐</span>
          <input
            className="input input-sm"
            style={{ flex: 1, minWidth: 0 }}
            value={it.text}
            placeholder={`Item ${i + 1}`}
            aria-label={`Afvinkitem ${i + 1}`}
            onChange={(e) => setItems(b.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
          />
          <button className="btn btn-quiet btn-sm btn-icon" disabled={b.items.length <= 1} aria-label={`Item ${i + 1} verwijderen`}
            onClick={() => setItems(b.items.filter((x) => x.id !== it.id))}>🗑</button>
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={() => setItems([...b.items, { id: uid(), text: '' }])}>
        + Item
      </button>
    </div>
  );
}

// ── Widget-blok: zoekbare keuze uit bestaande widgets ───────────────────────

function WidgetBlockEditor({ b, onChange }: { b: WidgetBlock; onChange: OnChange }) {
  // Live meebewegen met de opslag: wie in een ander tabblad net een widget
  // maakte ("🆕 Nieuwe widget maken"), ziet hem hier meteen verschijnen.
  const [widgets, setWidgets] = useState(() => getWidgets());
  useEffect(() => onStorageChange(() => setWidgets(getWidgets())), []);
  const [search, setSearch] = useState('');

  const selected = widgets.find((w) => w.id === b.widgetId);
  const q = search.trim().toLowerCase();
  const filtered = widgets.filter((w) => {
    if (!q) return true;
    const def = getTypeDef(w.type);
    return (
      w.title.toLowerCase().includes(q) ||
      w.code.toLowerCase().includes(q) ||
      def.name.toLowerCase().includes(q)
    );
  });
  // De gekozen widget altijd tonen, ook als de zoekterm hem wegfiltert.
  const options = selected && !filtered.some((w) => w.id === selected.id) ? [selected, ...filtered] : filtered;

  if (widgets.length === 0) {
    return (
      <div>
        <p className="hint" style={{ marginTop: 0 }}>
          Je hebt nog geen widgets. Maak er eerst één — daarna kan je hem hier in de cursus zetten.
        </p>
        <a className="btn btn-sm btn-ghost" href="#/nieuw" target="_blank" rel="noopener noreferrer">🆕 Nieuwe widget maken</a>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          className="input input-sm"
          style={{ maxWidth: 200 }}
          value={search}
          placeholder="🔍 Zoek widget…"
          aria-label="Zoek een widget op titel, code of type"
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select input-sm"
          style={{ flex: 1, minWidth: 220 }}
          value={b.widgetId}
          aria-label="Kies de widget voor dit blok"
          onChange={(e) => onChange({ ...b, widgetId: e.target.value })}
        >
          <option value="">— kies een widget —</option>
          {options.map((w) => {
            const def = getTypeDef(w.type);
            return (
              <option key={w.id} value={w.id}>
                {def.icon} {w.title} ({w.code})
              </option>
            );
          })}
        </select>
      </div>
      {b.widgetId && !selected && (
        <p className="hint" style={{ color: 'var(--err)' }}>
          ⚠ Deze widget bestaat niet (meer) in deze browser. Kies een andere.
        </p>
      )}
      {selected && (
        <div className="callout" style={{ marginBottom: 10, alignItems: 'center' }}>
          <span aria-hidden>🧩</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              <strong>{selected.title}</strong>
              {getTypeDef(selected.type).hasSubmissions
                ? ' — resultaten komen bij Resultaten terecht'
                : ' — oefenwidget zonder inzendingen'}
            </span>
            <a className="btn btn-sm btn-ghost" href={`#/bewerk/${selected.id}`} target="_blank" rel="noopener noreferrer">
              ✏️ Widget bewerken
            </a>
          </div>
        </div>
      )}
      <Field label="Notitie boven de widget (optioneel)" hint="Korte instructie voor de leerling, bv. 'Maak deze oefening na het lezen.'">
        <input
          className="input input-sm"
          value={b.note ?? ''}
          onChange={(e) => onChange({ ...b, note: e.target.value || undefined })}
        />
      </Field>
      <a className="btn btn-sm btn-quiet" href="#/nieuw" target="_blank" rel="noopener noreferrer">
        🆕 Nieuwe widget maken
      </a>
    </div>
  );
}
