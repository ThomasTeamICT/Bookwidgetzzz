import React from 'react';
import type { Widget } from '../lib/types';
import { encodeWidgetToUrl, exportWidgetJson, playUrlForCode } from '../lib/share';
import { downloadFile } from '../lib/utils';
import { CopyButton, Modal } from './ui';

export function ShareModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const codeUrl = playUrlForCode(widget.code);
  const portableUrl = encodeWidgetToUrl(widget);

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
          dus deze werkt overal — ook op toestellen van leerlingen thuis. Let op: resultaten worden dan
          alleen op het toestel van de leerling getoond, niet bij jou.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
        <input className="input input-sm" readOnly value={portableUrl} aria-label="Draagbare deellink" onFocus={(e) => e.target.select()} />
        <CopyButton text={portableUrl} label="Kopiëren" />
      </div>

      <hr className="divider" />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>Bestand:</strong>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => downloadFile(`${widget.title.replace(/[^\w\dà-ÿ -]/gi, '')}.widget.json`, exportWidgetJson(widget))}
        >
          💾 Exporteren (.json)
        </button>
        <span className="hint">Importeer dit bestand op een ander toestel via “Importeren” op het dashboard.</span>
      </div>
    </Modal>
  );
}
