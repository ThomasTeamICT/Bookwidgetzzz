import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Widget } from '../lib/types';
import { encodeWidgetToUrl, exportWidgetJson, playUrlForCode } from '../lib/share';
import { countUnresolvedMedia, inlineMedia } from '../lib/mediaStore';
import { downloadFile } from '../lib/utils';
import { CheckRow, CopyButton, Modal, useToast } from './ui';

interface Inlined {
  /** Widget met de media als data-URL (null zolang dat nog loopt). */
  widget: Widget | null;
  /** Media die niet mee konden (blob niet op dit toestel). */
  unresolved: number;
}

/**
 * De media van de widget staan in IndexedDB en moeten voor een draagbare link
 * of exportbestand als data-URL ingevoegd worden (lib/mediaStore). Dat is
 * werk voor de hoofdthread (base64 van elke afbeelding), dus precies één
 * keer per geopend deelvenster; de gewone én de aangepaste link delen het.
 */
function useInlinedWidget(widget: Widget): Inlined {
  const [state, setState] = useState<Inlined>({ widget: null, unresolved: 0 });
  useEffect(() => {
    let alive = true;
    setState({ widget: null, unresolved: 0 });
    inlineMedia(widget)
      .then((w) => { if (alive) setState({ widget: w, unresolved: countUnresolvedMedia(w) }); })
      .catch(() => { if (alive) setState({ widget, unresolved: countUnresolvedMedia(widget) }); });
    return () => { alive = false; };
  }, [widget]);
  return state;
}

export function ShareModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const toast = useToast();
  const codeUrl = playUrlForCode(widget.code);
  const inlined = useInlinedWidget(widget);
  const portableUrl = useMemo(() => (inlined.widget ? encodeWidgetToUrl(inlined.widget) : ''), [inlined.widget]);
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
      const json = exportWidgetJson(inlined.widget ?? (await inlineMedia(widget)));
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
      {inlined.unresolved > 0 && (
        <div className="callout warn">
          <span aria-hidden>⚠️</span>
          <div>
            {inlined.unresolved === 1 ? 'Eén afbeelding of bijlage' : `${inlined.unresolved} afbeeldingen of bijlagen`} van deze
            widget staan niet (meer) op dit toestel en reizen dus niet mee in de link of het bestand.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 300px' }}>
          {portableUrl ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input className="input input-sm" readOnly value={portableUrl} aria-label="Draagbare deellink" onFocus={(e) => e.target.select()} />
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
            </>
          ) : (
            // Pas tonen als de link er écht is: anders kopieert of mailt iemand een lege link.
            <p className="hint" role="status" aria-busy>Link wordt klaargemaakt (afbeeldingen worden ingevoegd)…</p>
          )}
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

      <AdaptedLinkSection widget={widget} inlined={inlined.widget} />

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
function AdaptedLinkSection({ widget, inlined }: { widget: Widget; inlined: Widget | null }) {
  const [open, setOpen] = useState(false);
  const [extraTime, setExtraTime] = useState(true);
  const [noLimit, setNoLimit] = useState(false);
  const [extraAttempt, setExtraAttempt] = useState(false);

  // Vertrekt van de al ingelijnde widget: enkel de instellingen wijzigen en
  // opnieuw coderen, niet opnieuw alle afbeeldingen omzetten.
  const adaptedUrl = useMemo(() => {
    if (!inlined) return '';
    const w: Widget = { ...inlined, settings: { ...inlined.settings } };
    if (noLimit) w.settings.timeLimitMin = 0;
    else if (extraTime && w.settings.timeLimitMin > 0) w.settings.timeLimitMin = Math.ceil(w.settings.timeLimitMin * 1.5);
    if (extraAttempt && w.settings.maxAttempts > 0) w.settings.maxAttempts += 1;
    return encodeWidgetToUrl(w);
  }, [inlined, extraTime, noLimit, extraAttempt]);

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
