import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, createWidget, WIDGET_TYPES } from '../widgets/registry';
import { saveWidget } from '../lib/storage';
import { extractPlaceholders, fillPlaceholders, TEMPLATES } from '../lib/templates';
import {
  deleteCustomTemplate, getCustomTemplates, instantiateTemplate,
} from '../lib/customTemplates';
import type { CustomTemplate } from '../lib/customTemplates';
import { formatDateShort } from '../lib/utils';
import { ConfirmModal, Field, Modal } from '../components/ui';
import type { Widget, WidgetTypeId } from '../lib/types';

/** "HERHAALVRAAG 1" → "Herhaalvraag 1": leesbaar label voor een invulveld. */
function readableLabel(placeholder: string): string {
  return placeholder.charAt(0) + placeholder.slice(1).toLowerCase();
}

/** Sjabloon dat klaarstaat om ingevuld te worden via de invul-modal. */
interface FillState {
  widget: Widget;
  placeholders: string[];
  values: Record<string, string>;
}

export function NewWidgetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselect = params.get('type');
  const [customTemplates, setCustomTemplates] = React.useState<CustomTemplate[]>(() => getCustomTemplates());
  const [templateToDelete, setTemplateToDelete] = React.useState<CustomTemplate | null>(null);
  const [fill, setFill] = React.useState<FillState | null>(null);

  const create = (type: WidgetTypeId) => {
    const w = createWidget(type);
    saveWidget(w);
    navigate(`/bewerk/${w.id}`, { replace: true });
  };

  const finishWidget = (w: Widget) => {
    saveWidget(w);
    navigate(`/bewerk/${w.id}`);
  };

  /** Opent eerst de invul-modal wanneer het sjabloon [PLACEHOLDERS] bevat. */
  const startWithPlaceholders = (w: Widget) => {
    const placeholders = extractPlaceholders(w);
    if (placeholders.length === 0) finishWidget(w);
    else setFill({ widget: w, placeholders, values: {} });
  };

  const startFromTemplate = (t: CustomTemplate) => {
    // sjablonen met een (na een update) onbekend widgettype nooit instantiëren
    if (!WIDGET_TYPES.some((wt) => wt.id === t.typeId)) return;
    startWithPlaceholders(instantiateTemplate(t));
  };

  const preselectDone = React.useRef(false);
  React.useEffect(() => {
    // guard tegen dubbele uitvoering (React StrictMode mount-cyclus)
    if (preselectDone.current) return;
    preselectDone.current = true;
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

      <Link
        to="/ai-studio"
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', marginBottom: 30,
          textDecoration: 'none', border: '1px solid var(--brand)', background: 'var(--brand-soft)',
        }}
      >
        <span style={{ fontSize: '1.9rem' }} aria-hidden>✨</span>
        <span style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>Laat de AI het voorbereidende werk doen</h3>
          <p style={{ margin: '2px 0 0', color: 'var(--text-soft)' }}>
            Plak je cursustekst of leerplandoelen en krijg kant-en-klare widgets als voorzet — jij kijkt na en bewaart.
          </p>
        </span>
        <span className="btn btn-ai" aria-hidden>Naar de AI-studio →</span>
      </Link>

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
              onClick={() => startWithPlaceholders(t.build())}
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

      {fill && (
        <Modal
          title="Vul je sjabloon in"
          onClose={() => setFill(null)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const w = fill.widget;
                  setFill(null);
                  finishWidget(w);
                }}
              >
                Overslaan
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const w = fillPlaceholders(fill.widget, fill.values);
                  setFill(null);
                  finishWidget(w);
                }}
              >
                Widget aanmaken
              </button>
            </>
          }
        >
          <p className="hint" style={{ marginBottom: 14 }}>
            Dit sjabloon bevat invulvelden. Velden die je leeg laat, blijven als [placeholder] in
            de widget staan — die kan je later in de editor nog invullen.
          </p>
          {fill.placeholders.map((p) => (
            <Field key={p} label={readableLabel(p)}>
              <input
                type="text"
                value={fill.values[p] ?? ''}
                placeholder={`[${p}]`}
                aria-label={readableLabel(p)}
                onChange={(e) =>
                  setFill((f) => (f ? { ...f, values: { ...f.values, [p]: e.target.value } } : f))
                }
              />
            </Field>
          ))}
        </Modal>
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
