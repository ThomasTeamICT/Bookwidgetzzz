import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, createWidget, WIDGET_TYPES } from '../widgets/registry';
import { saveWidget } from '../lib/storage';
import { TEMPLATES } from '../lib/templates';
import {
  deleteCustomTemplate, getCustomTemplates, instantiateTemplate,
} from '../lib/customTemplates';
import type { CustomTemplate } from '../lib/customTemplates';
import { formatDateShort } from '../lib/utils';
import { ConfirmModal } from '../components/ui';
import type { WidgetTypeId } from '../lib/types';

export function NewWidgetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselect = params.get('type');
  const [customTemplates, setCustomTemplates] = React.useState<CustomTemplate[]>(() => getCustomTemplates());
  const [templateToDelete, setTemplateToDelete] = React.useState<CustomTemplate | null>(null);

  const create = (type: WidgetTypeId) => {
    const w = createWidget(type);
    saveWidget(w);
    navigate(`/bewerk/${w.id}`, { replace: true });
  };

  const startFromTemplate = (t: CustomTemplate) => {
    const w = instantiateTemplate(t);
    saveWidget(w);
    navigate(`/bewerk/${w.id}`);
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

      {customTemplates.length > 0 && (
        <section style={{ marginBottom: 30 }} aria-labelledby="cat-mytemplates">
          <h2 id="cat-mytemplates" style={{ fontSize: '1.1rem', marginBottom: 4 }}>⭐ Mijn sjablonen</h2>
          <p className="hint" style={{ marginBottom: 12 }}>
            Sjablonen die je zelf bewaarde vanuit de editor — klik om er een nieuwe widget mee te starten.
          </p>
          <div className="type-grid">
            {customTemplates.map((t) => {
              const def = WIDGET_TYPES.find((x) => x.id === t.typeId);
              return (
                <div key={t.id} style={{ position: 'relative' }}>
                  <button
                    className="card type-card"
                    style={{ width: '100%', height: '100%' }}
                    onClick={() => startFromTemplate(t)}
                  >
                    <span className="type-icon" style={{ background: def?.color ?? 'var(--brand)' }} aria-hidden>
                      {def?.icon ?? '⭐'}
                    </span>
                    <span>
                      <h3>{t.name}</h3>
                      <p>{def?.name ?? t.typeId} · bewaard op {formatDateShort(t.savedAt)}</p>
                    </span>
                  </button>
                  <button
                    className="btn btn-sm btn-quiet btn-icon"
                    style={{ position: 'absolute', top: 8, right: 8 }}
                    aria-label={`Sjabloon "${t.name}" verwijderen`}
                    title="Sjabloon verwijderen"
                    onClick={() => setTemplateToDelete(t)}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {templateToDelete && (
        <ConfirmModal
          title="Sjabloon verwijderen?"
          message={`Weet je zeker dat je het sjabloon "${templateToDelete.name}" wil verwijderen? Widgets die je er al mee maakte, blijven gewoon bestaan.`}
          confirmLabel="Verwijderen"
          onConfirm={() => {
            deleteCustomTemplate(templateToDelete.id);
            setCustomTemplates(getCustomTemplates());
          }}
          onClose={() => setTemplateToDelete(null)}
        />
      )}

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
