import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Course } from '../../lib/courseTypes';
import { courseReadUrl, encodeCourseToUrl, exportCourseJson } from '../../lib/courses';
import { referencedWidgetIds } from '../../lib/courseTypes';
import { downloadFile } from '../../lib/utils';
import { CopyButton, Modal } from '../ui';

export function CourseShareModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(() => course.chapters.map((c) => c.id));
  const [qr, setQr] = useState('');

  const partial = selected.length > 0 && selected.length < course.chapters.length;
  const portableUrl = useMemo(
    () => (selected.length ? encodeCourseToUrl(course, partial ? selected : undefined) : ''),
    [course, selected, partial]
  );
  const readUrl = courseReadUrl(course.code);
  const widgetCount = referencedWidgetIds({ ...course, chapters: course.chapters.filter((c) => selected.includes(c.id)) }).length;
  const mailUrl = `mailto:?subject=${encodeURIComponent(`Cursus: ${course.title}`)}&body=${encodeURIComponent(`Dag!\n\nHier vind je de cursus "${course.title}": ${portableUrl}\n\nVeel leesplezier!`)}`;

  useEffect(() => {
    let alive = true;
    if (!portableUrl) { setQr(''); return; }
    QRCode.toDataURL(portableUrl, { width: 220, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { /* QR is optioneel; bij extreem lange links kan dit falen */ });
    return () => { alive = false; };
  }, [portableUrl]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Modal title={`“${course.title}” delen`} onClose={onClose} wide>
      <h3 style={{ marginTop: 0 }}>Wat deel je?</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        Deel gerust per hoofdstuk — zo groeit de cursus mee met je lessenreeks. Ingebedde oefen-widgets reizen automatisch mee{widgetCount > 0 ? ` (${widgetCount} in deze selectie)` : ''}.
      </p>
      <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
        {course.chapters.map((ch) => (
          <label key={ch.id} className="checkbox-row">
            <input type="checkbox" checked={selected.includes(ch.id)} onChange={() => toggle(ch.id)} />
            <span>{ch.emoji} {ch.title} <span className="hint">({ch.sections.length} secties)</span></span>
          </label>
        ))}
      </div>

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden>🌍</span>
        <div>
          <strong>Draagbare link (elk toestel):</strong> de cursus zit volledig in de link — werkt
          overal, ook thuis, zonder account. De leesvoortgang blijft dan op het toestel van de
          leerling; die stuurt op het einde zijn <em>voortgangscode</em> door.
        </div>
      </div>
      {selected.length === 0 ? (
        <p className="hint">Vink minstens één hoofdstuk aan.</p>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', margin: '10px 0 14px' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input className="input input-sm" readOnly value={portableUrl} aria-label="Draagbare cursuslink" onFocus={(e) => e.target.select()} />
              <CopyButton text={portableUrl} label="Kopiëren" />
            </div>
            <p className="hint" style={{ margin: '0 0 8px' }}>Linklengte: {portableUrl.length.toLocaleString('nl-BE')} tekens.</p>
            {portableUrl.length > 8000 && (
              <div className="callout warn" style={{ marginBottom: 8 }}>
                <span aria-hidden>⚠️</span>
                <div>
                  Deze link is fors (grote afbeeldingen of bijlagen?). Sommige apps knippen zulke
                  links af. Deel per hoofdstuk, of gebruik het <strong>cursusbestand</strong> hieronder.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-sm btn-ghost" href={mailUrl}>✉️ Versturen via e-mail</a>
              <a
                className="btn btn-sm btn-ghost"
                href={`https://classroom.google.com/share?url=${encodeURIComponent(portableUrl)}`}
                target="_blank" rel="noopener noreferrer"
              >
                🎓 Delen in Google Classroom
              </a>
            </div>
          </div>
          {qr && (
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <img src={qr} alt="QR-code met de cursuslink" style={{ borderRadius: 10, border: '1px solid var(--line)' }} />
              <figcaption className="hint">Scan met de klas</figcaption>
            </figure>
          )}
        </div>
      )}

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden>🏫</span>
        <div>
          <strong>In de klas (zelfde toestel/browser):</strong> op toestellen waar de cursus al staat
          (bv. de klas-pc, of nadat de leerling één keer de draagbare link opende) volstaat de korte code.
          Voortgang komt dan automatisch bij jou terecht.
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '10px 0 14px' }}>
        <div style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {course.code}
        </div>
        <CopyButton text={course.code} label="Code kopiëren" />
        <CopyButton text={readUrl} label="Directe link kopiëren" />
      </div>

      <hr className="divider" />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => downloadFile(`${course.title || 'cursus'}.json`, exportCourseJson(course))}
        >
          💾 Cursusbestand (.json)
        </button>
        <span className="hint">
          Voor collega's of als back-up — de volledige cursus mét ingebedde widgets. Importeren kan bij Cursussen.
        </span>
      </div>
    </Modal>
  );
}
