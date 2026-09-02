import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Widget } from '../lib/types';
import { encodeWidgetToUrl, exportWidgetJsonWithMedia, playUrlForCode } from '../lib/share';
import { inlineMedia } from '../lib/mediaStore';
import { downloadFile } from '../lib/utils';
import { CheckRow, CopyButton, Modal, useToast } from './ui';

/**
 * Draagbare link, async: de media van de widget staan in IndexedDB en moeten
 * eerst als data-URL ingevoegd worden (lib/mediaStore). Leeg zolang dat loopt.
 */
function usePortableUrl(widget: Widget, transform?: (w: Widget) => Widget): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    inlineMedia(widget)
      .then((w) => { if (alive) setUrl(encodeWidgetToUrl(transform ? transform(w) : w)); })
      .catch(() => { if (alive) setUrl(encodeWidgetToUrl(transform ? transform(widget) : widget)); });
    return () => { alive = false; };
  }, [widget, transform]);
  return url;
}

export function ShareModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const toast = useToast();
  const codeUrl = playUrlForCode(widget.code);
  const portableUrl = usePortableUrl(widget);
  const [qr, setQr] = useState<string>('');
  const embedCode = `<iframe src="${portableUrl}" width="100%" height="640" style="border:0;border-radius:12px" allowfullscreen title="${widget.title.replace(/"/g, '&quot;')}"></iframe>`;
  const classroomUrl = `https://classroom.google.com/share?url=${encodeURIComponent(portableUrl)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(`Oefening: ${widget.title}`)}&body=${encodeURIComponent(`Dag!\n\nMaak deze oefening: ${portableUrl}\n\nVeel succes!`)}`;

  useEffect(() => {
    let alive = true;
    if (!portableUrl) { setQr(''); return; }
    QRCode.toDataURL(portableUrl, { width: 240, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(''); /* te lang voor een QR (grote afbeeldingen) */ });
    return () => { alive = false; };
  }, [portableUrl]);

  const exportJson = async () => {
    try {
      const json = await exportWidgetJsonWithMedia(widget);
      downloadFile(`${widget.title.replace(/[^\w\dà-ÿ -]/gi, '')}.widget.json`, json);
    } catch {
      toast('Exporteren mislukt', 'err');
    }
  };

  return (
    <Modal title={`“${widget.title}” delen`} onClose={onClose} wide>
      <div className="callout">
        <span aria-hidden>🏫</span>
        <div>
          <strong>Klascode (zelfde toestel/browser):</strong> leerlingen surfen naar de app, klikken op
          {' '}<em>Ik ben leerling</em> en geven deze code in. Resultaten komen automatisch bij jou terecht.
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '10px 0 18px' }}>
        <div style={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {widget.code}
        </div>
        <CopyButton text={widget.code} label="Code kopiëren" />
        <CopyButton text={codeUrl} label="Directe link kopiëren" />
      </div>

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden>🌍</span>
        <div>
          <strong>Draagbare link (elk toestel):</strong> de volledige widget zit in de link zelf,
          dus deze werkt overal — ook thuis. Resultaten blijven dan wel op het toestel van de leerling.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              className="input input-sm"
              readOnly
              value={portableUrl || 'Link wordt klaargemaakt…'}
              aria-label="Draagbare deellink"
              aria-busy={!portableUrl}
              onFocus={(e) => e.target.select()}
            />
            <CopyButton text={portableUrl} label="Kopiëren" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-sm btn-ghost" href={classroomUrl} target="_blank" rel="noopener noreferrer">
              🎓 Delen in Google Classroom
            </a>
            <a className="btn btn-sm btn-ghost" href={mailUrl}>
              ✉️ Mailen
            </a>
          </div>
        </div>
        {qr && (
          <figure style={{ margin: 0, textAlign: 'center' }}>
            <img
              src={qr}
              alt={`QR-code voor de draagbare link van ${widget.title}`}
              style={{ width: 132, height: 132, borderRadius: 10, border: '1px solid var(--line)', background: '#fff' }}
            />
            <figcaption className="hint" style={{ marginTop: 4 }}>
              Scan met tablet of gsm
              <br />
              <a href={qr} download={`qr-${widget.code}.png`}>QR downloaden</a>
            </figcaption>
          </figure>
        )}
      </div>

      <hr className="divider" />

      <AdaptedLinkSection widget={widget} />

      <hr className="divider" />

      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🔗 Insluiten in je eigen website (embed)</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <textarea className="textarea" rows={3} readOnly value={embedCode} aria-label="Embed-code" onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
          <CopyButton text={embedCode} label="Kopiëren" />
        </div>
      </details>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>Bestand:</strong>
        <button className="btn btn-sm btn-ghost" onClick={() => { void exportJson(); }}>
          💾 Exporteren (.json)
        </button>
        <span className="hint">Importeer dit bestand op een ander toestel of geef het aan een collega.</span>
      </div>
    </Modal>
  );
}

/**
 * Redelijke aanpassingen, discreet: een aangepaste variant van de draagbare
 * link (meer tijd, extra poging) die er voor de leerling identiek uitziet.
 */
function AdaptedLinkSection({ widget }: { widget: Widget }) {
  const [open, setOpen] = useState(false);
  const [extraTime, setExtraTime] = useState(true);
  const [noLimit, setNoLimit] = useState(false);
  const [extraAttempt, setExtraAttempt] = useState(false);

  const adapt = useCallback((src: Widget) => {
    const w: Widget = JSON.parse(JSON.stringify(src));
    if (noLimit) w.settings.timeLimitMin = 0;
    else if (extraTime && w.settings.timeLimitMin > 0) w.settings.timeLimitMin = Math.ceil(w.settings.timeLimitMin * 1.5);
    if (extraAttempt && w.settings.maxAttempts > 0) w.settings.maxAttempts += 1;
    return w;
  }, [extraTime, noLimit, extraAttempt]);
  const adaptedUrl = usePortableUrl(widget, adapt);

  const hasEffect = noLimit || (extraTime && widget.settings.timeLimitMin > 0) || (extraAttempt && widget.settings.maxAttempts > 0);

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 4 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        ♿ Aangepaste link (redelijke aanpassingen)
      </summary>
      <div style={{ paddingTop: 8 }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Voor leerlingen met bv. dyslexie of aandachtproblemen: dezelfde oefening, discreet aangepast.
          De leerling ziet geen verschil met de gewone link.
        </p>
        <CheckRow checked={extraTime && !noLimit} onChange={(v) => { setExtraTime(v); if (v) setNoLimit(false); }} label={`Tijdslimiet × 1,5${widget.settings.timeLimitMin > 0 ? ` (${widget.settings.timeLimitMin} → ${Math.ceil(widget.settings.timeLimitMin * 1.5)} min)` : ' (geen limiet ingesteld)'}`} />
        <CheckRow checked={noLimit} onChange={(v) => { setNoLimit(v); if (v) setExtraTime(false); }} label="Geen tijdslimiet" />
        <CheckRow checked={extraAttempt} onChange={setExtraAttempt} label={`Eén extra poging${widget.settings.maxAttempts > 0 ? ` (${widget.settings.maxAttempts} → ${widget.settings.maxAttempts + 1})` : ' (onbeperkt ingesteld)'}`} />
        {hasEffect ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input className="input input-sm" readOnly value={adaptedUrl || 'Link wordt klaargemaakt…'} aria-label="Aangepaste deellink" aria-busy={!adaptedUrl} onFocus={(e) => e.target.select()} />
            <CopyButton text={adaptedUrl} label="Kopiëren" />
          </div>
        ) : (
          <p className="hint">Vink een aanpassing aan die effect heeft op deze widget.</p>
        )}
      </div>
    </details>
  );
}
