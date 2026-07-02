import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { decodeWidgetFromParam } from '../lib/share';
import { getWidget, saveWidget } from '../lib/storage';
import { WidgetRunner } from './PlayerPage';
import { useToast } from '../components/ui';
import { uid } from '../lib/utils';
import { makeCode } from '../lib/utils';

/** Opent een draagbare deellink: de widget zit volledig in de URL. */
export function OpenSharedPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const widget = useMemo(() => {
    const d = params.get('d');
    return d ? decodeWidgetFromParam(d) : null;
  }, [params]);
  const [saved, setSaved] = useState(false);

  if (!widget) {
    return (
      <div className="player-shell" style={{ minHeight: '100vh' }}>
        <div className="player-main" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: '3rem' }} aria-hidden>🔗</div>
          <h1>Ongeldige link</h1>
          <p style={{ color: 'var(--text-soft)' }}>Deze deellink is onvolledig of beschadigd. Vraag een nieuwe link.</p>
          <Link to="/" className="btn btn-primary">Naar de startpagina</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <WidgetRunner widget={widget} recordSubmission />
      <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 60 }}>
        <button
          className="btn btn-sm btn-ghost"
          style={{ boxShadow: 'var(--shadow-2)', background: 'var(--bg-raised)' }}
          disabled={saved}
          onClick={() => {
            const existing = getWidget(widget.id);
            const copy = existing ? { ...widget, id: uid(), code: makeCode() } : widget;
            saveWidget(copy);
            setSaved(true);
            toast('Widget bewaard bij “Mijn widgets”', 'ok');
          }}
        >
          {saved ? '✓ Bewaard' : '💾 Bewaar in mijn widgets'}
        </button>
      </div>
    </div>
  );
}
