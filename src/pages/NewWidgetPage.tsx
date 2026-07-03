import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, createWidget, WIDGET_TYPES } from '../widgets/registry';
import { saveWidget } from '../lib/storage';
import { TEMPLATES } from '../lib/templates';
import type { WidgetTypeId } from '../lib/types';

export function NewWidgetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselect = params.get('type');

  const create = (type: WidgetTypeId) => {
    const w = createWidget(type);
    saveWidget(w);
    navigate(`/bewerk/${w.id}`, { replace: true });
  };

  React.useEffect(() => {
    if (preselect && WIDGET_TYPES.some((t) => t.id === preselect)) {
      create(preselect as WidgetTypeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Nieuwe widget</h1>
          <p className="sub">Kies het type dat bij je les past — je kan alles daarna nog aanpassen.</p>
        </div>
      </div>
      <section style={{ marginBottom: 30 }} aria-labelledby="cat-templates">
        <h2 id="cat-templates" style={{ fontSize: '1.1rem', marginBottom: 4 }}>🎁 Start van een sjabloon</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Didactisch doordachte startpunten — vul de [placeholders] in en klaar.
        </p>
        <div className="type-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="card type-card"
              onClick={() => {
                const w = t.build();
                saveWidget(w);
                navigate(`/bewerk/${w.id}`);
              }}
            >
              <span className="type-icon" style={{ background: 'linear-gradient(135deg, var(--brand), var(--accent))' }} aria-hidden>{t.icon}</span>
              <span>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
              </span>
            </button>
          ))}
        </div>
      </section>

      {CATEGORIES.map((cat) => {
        const types = WIDGET_TYPES.filter((t) => t.category === cat.id);
        return (
          <section key={cat.id} style={{ marginBottom: 26 }} aria-labelledby={`cat-${cat.id}`}>
            <h2 id={`cat-${cat.id}`} style={{ fontSize: '1.1rem', marginBottom: 12 }}>{cat.icon} {cat.name}</h2>
            <div className="type-grid">
              {types.map((t) => (
                <button key={t.id} className="card type-card" onClick={() => create(t.id)}>
                  <span className="type-icon" style={{ background: t.color }} aria-hidden>{t.icon}</span>
                  <span>
                    <h3>{t.name}</h3>
                    <p>{t.tagline}</p>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
