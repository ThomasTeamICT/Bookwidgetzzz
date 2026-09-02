import type { Widget, WidgetTypeId } from './types';
import { makeCode, uid } from './utils';
import { parseWithMedia, stringifyWithMedia } from './mediaStore';

// ── Eigen sjablonen: een widget bewaren als herbruikbaar startpunt ──────────
//
// Opslag in localStorage onder "wf.customtemplates.v1". Het sjabloon bevat een
// diepe kopie van de widget; pas bij het instantiëren krijgt de nieuwe widget
// een eigen id en deelcode (geen hergebruik).

const KEY = 'wf.customtemplates.v1';

export interface CustomTemplate {
  id: string;
  name: string;
  typeId: WidgetTypeId;
  savedAt: number;
  /** Diepe kopie van de widget op het moment van bewaren. */
  widget: Widget;
}

export function getCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = parseWithMedia(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CustomTemplate => {
        if (!t || typeof t !== 'object') return false;
        const c = t as CustomTemplate;
        // widget zelf ook valideren: een corrupte entry mag nooit tot een
        // widget zonder geldig type/config leiden (crasht anders het dashboard)
        return (
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          !!c.widget && typeof c.widget === 'object' &&
          typeof c.widget.type === 'string' &&
          !!c.widget.config && typeof c.widget.config === 'object' &&
          !!c.widget.settings && typeof c.widget.settings === 'object'
        );
      }
    );
  } catch {
    return [];
  }
}

/**
 * Schrijft de volledige lijst weg. Kan een quota-fout gooien — de aanroeper
 * vangt die netjes af. Afbeeldingen gaan als verwijzing mee (lib/mediaStore),
 * dus een sjabloon weegt zelden meer dan een paar kB.
 */
function writeAll(templates: CustomTemplate[]): void {
  localStorage.setItem(KEY, stringifyWithMedia(templates));
}

/**
 * Bewaart een diepe kopie van de widget als eigen sjabloon.
 * Gooit een fout wanneer de lokale opslag vol is.
 */
export function saveCustomTemplate(name: string, widget: Widget): CustomTemplate {
  const template: CustomTemplate = {
    id: uid(),
    name: name.trim() || widget.title || 'Naamloos sjabloon',
    typeId: widget.type,
    savedAt: Date.now(),
    widget: JSON.parse(JSON.stringify(widget)) as Widget,
  };
  const all = getCustomTemplates();
  all.unshift(template);
  writeAll(all);
  return template;
}

export function deleteCustomTemplate(id: string): void {
  try {
    writeAll(getCustomTemplates().filter((t) => t.id !== id));
  } catch {
    // Verwijderen maakt de opslag alleen kleiner; fouten zijn hier onwaarschijnlijk.
  }
}

/**
 * Maakt een nieuwe widget op basis van een sjabloon, volgens de
 * createWidget-conventies: verse id en deelcode, titel = sjabloonnaam,
 * geen map, en nieuwe tijdstempels. Id en code worden nooit hergebruikt.
 */
export function instantiateTemplate(t: CustomTemplate): Widget {
  const copy = JSON.parse(JSON.stringify(t.widget)) as Widget;
  return {
    ...copy,
    id: uid(),
    code: makeCode(),
    title: t.name,
    folderId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
