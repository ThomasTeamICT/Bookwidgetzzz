import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import { getTypeDef } from '../widgets/registry';
import { formatDate, pct } from '../lib/utils';
import { EmptyState } from '../components/ui';

export function ResultsOverviewPage() {
  const [, force] = useState(0);
  React.useEffect(() => onStorageChange(() => force((x) => x + 1)), []);

  const widgets = getWidgets().filter((w) => getTypeDef(w.type).hasSubmissions);
  const withSubs = widgets
    .map((w) => ({ widget: w, subs: getSubmissions(w.id) }))
    .filter((x) => x.subs.length > 0)
    .sort((a, b) => Math.max(...b.subs.map((s) => s.submittedAt)) - Math.max(...a.subs.map((s) => s.submittedAt)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resultaten</h1>
          <p className="sub">Alle inzendingen van je leerlingen, per widget.</p>
        </div>
      </div>

      {withSubs.length === 0 ? (
        <EmptyState icon="📊" title="Nog geen inzendingen">
          <p>Deel een widget met je klas via de code of link — de resultaten verschijnen hier automatisch.</p>
          <Link to="/widgets" className="btn btn-primary">Naar mijn widgets</Link>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Widget</th>
                <th>Inzendingen</th>
                <th>Gemiddelde score</th>
                <th>Te beoordelen</th>
                <th>Laatste inzending</th>
              </tr>
            </thead>
            <tbody>
              {withSubs.map(({ widget, subs }) => {
                const def = getTypeDef(widget.type);
                const scored = subs.filter((s) => s.totalMax > 0);
                const avg = scored.length > 0
                  ? Math.round(scored.reduce((sum, s) => sum + pct(s.totalEarned, s.totalMax), 0) / scored.length)
                  : null;
                const pending = subs.filter((s) => s.status === 'submitted').length;
                const last = Math.max(...subs.map((s) => s.submittedAt));
                return (
                  <tr key={widget.id} onClick={() => (location.hash = `#/resultaten/${widget.id}`)}>
                    <td>
                      <strong>{def.icon} {widget.title}</strong>
                      <div className="hint">{def.name} · code {widget.code}</div>
                    </td>
                    <td>{subs.length}</td>
                    <td>
                      {avg === null ? <span className="hint">—</span> : (
                        <div className="scorebar">
                          <div className="bar"><div style={{ width: `${avg}%`, background: avg >= 70 ? 'var(--ok)' : avg >= 45 ? 'var(--warn)' : 'var(--err)' }} /></div>
                          <strong>{avg}%</strong>
                        </div>
                      )}
                    </td>
                    <td>{pending > 0 ? <span className="badge badge-warn">✍️ {pending}</span> : <span className="badge badge-ok">✓ klaar</span>}</td>
                    <td className="hint">{formatDate(last)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
