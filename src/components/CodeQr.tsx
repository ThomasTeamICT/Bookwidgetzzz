import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QR_MAX_CHARS } from '../lib/qrLimits';
import { CopyButton, Modal } from './ui';

/**
 * QR-code van een tekst (meestal een resultaat- of voortgangscode, of een
 * klaslink). Een QR heeft een harde capaciteitsgrens: boven ±2 300 tekens
 * lukt het niet meer, of wordt de code zo fijn dat geen enkele telefoon ze
 * nog leest. Dan tonen we eerlijk waarom, met de kopieerknop als alternatief —
 * nooit een lege plek of een onleesbaar blokje.
 */
export function CodeQr({
  value,
  label,
  size = 190,
  maxChars = QR_MAX_CHARS,
  hint,
  copyLabel = 'Code kopiëren',
}: {
  value: string;
  /** Beschrijving voor de alt-tekst, bv. "de resultaatcode van Emma". */
  label: string;
  size?: number;
  maxChars?: number;
  hint?: string;
  copyLabel?: string;
}) {
  const [dataUrl, setDataUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);
  const tooLong = value.length > maxChars;

  useEffect(() => {
    let alive = true;
    setDataUrl('');
    setFailed(false);
    if (!value || tooLong) return;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'L' })
      .then((url) => { if (alive) setDataUrl(url); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [value, size, tooLong]);

  if (!value) return null;

  if (tooLong || failed) {
    return (
      <div className="callout" role="note">
        <span aria-hidden>📋</span>
        <div>
          <strong>Te groot voor een QR-code.</strong> Deze code bevat te veel (bv. een tekening of
          foto) om ze te laten scannen. Kopieer ze en stuur ze door via je gewone kanaal.
          <div style={{ marginTop: 8 }}>
            <CopyButton text={value} label={copyLabel} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {dataUrl ? (
        <button
          type="button"
          className="btn btn-quiet"
          style={{ padding: 4, height: 'auto', background: '#fff', borderRadius: 12 }}
          onClick={() => setBig(true)}
          aria-label={`QR-code van ${label} groter tonen`}
          title="Groter tonen"
        >
          <img
            src={dataUrl}
            alt={`QR-code van ${label}`}
            width={size}
            height={size}
            style={{ display: 'block', width: size, height: size, borderRadius: 8 }}
          />
        </button>
      ) : (
        <p className="hint" role="status" style={{ width: size, textAlign: 'center' }}>QR-code wordt gemaakt…</p>
      )}
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        {hint && <p className="hint" style={{ marginTop: 0 }}>{hint}</p>}
        <CopyButton text={value} label={copyLabel} />
      </div>
      {big && dataUrl && (
        <Modal title={`QR-code van ${label}`} onClose={() => setBig(false)}>
          <div style={{ textAlign: 'center', background: '#fff', padding: 16, borderRadius: 12 }}>
            <img
              src={dataUrl}
              alt={`QR-code van ${label}`}
              style={{ width: 'min(70vw, 340px)', height: 'auto', imageRendering: 'pixelated' }}
            />
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
            Houd je scherm stil voor de camera van je leerkracht.
          </p>
        </Modal>
      )}
    </div>
  );
}
