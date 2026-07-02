import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Widget } from '../lib/types';
import { encodeWidgetToUrl, exportWidgetJson, playUrlForCode } from '../lib/share';
import { downloadFile } from '../lib/utils';
import { CopyButton, Modal } from './ui';

export function ShareModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const codeUrl = playUrlForCode(widget.code);
  const portableUrl = encodeWidgetToUrl(widget);
  const [qr, setQr] = useState<string>('');
  const embedCode = `<iframe src="${portableUrl}" width="100%" height="640" style="border:0;border-radius:12px" allowfullscreen title="${widget.title.replace(/"/g, '&quot;')}"></iframe>`;
  const classroomUrl = `https://classroom.google.com/share?url=${encodeURIComponent(portableUrl)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(`Oefening: ${widget.title}`)}&body=${encodeURIComponent(`Dag!\n\nMaak deze oefening: ${portableUrl}\n\nVeel succes!`)}`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(portableUrl, { width: 240, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { /* QR is optioneel */ });
    return () => { alive = false; };
  }, [portableUrl]);

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

      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🔗 Insluiten in je eigen website (embed)</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <textarea className="textarea" rows={3} readOnly value={embedCode} aria-label="Embed-code" onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
          <CopyButton text={embedCode} label="Kopiëren" />
        </div>
      </details>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>Bestand:</strong>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => downloadFile(`${widget.title.replace(/[^\w\dà-ÿ -]/gi, '')}.widget.json`, exportWidgetJson(widget))}
        >
          💾 Exporteren (.json)
        </button>
        <span className="hint">Importeer dit bestand op een ander toestel of geef het aan een collega.</span>
      </div>
    </Modal>
  );
}
