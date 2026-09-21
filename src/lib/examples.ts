// ── Voorbeeldcursus: bestaand materiaal van een leerkracht ──────────────────
//
// public/voorbeelden/natuurwetenschappen-1e-graad.json is een echte cursus
// (14 pdf-hoofdstukken) die door de importpagina ging — "Samenvoegen tot één
// cursus", sectieniveau 3 — en daarna aangevuld werd met de afbeeldingen uit
// de pdf's, doelcodes op elke sectie en flitskaarten uit elke begrippenlijst
// (zie tools/build-voorbeeldcursus.py). Ze laadt lui, alleen op verzoek: het
// bestand met afbeeldingen is te groot om standaard mee te bundelen.
//
// De afbeeldingen zijn gewone bestanden naast de app (voorbeelden/nw/…): ze
// reizen mee met een deellink of klaspakket zolang de app op dezelfde plek
// staat, en wegen niet op localStorage of IndexedDB.

import { adoptSharedCourse, getCourse, importCourseJson } from './courses';
import type { Course } from './courseTypes';
import type { Widget } from './types';

export const EXAMPLE_COURSE_ID = 'nw-voorbeeld-1e-graad';
const EXAMPLE_COURSE_FILE = 'voorbeelden/natuurwetenschappen-1e-graad.json';

/** Relatieve media-URL's uit het voorbeeldbestand absoluut maken t.o.v. de app-basis. */
export function absolutizeExampleUrls(course: Course, base: string): Course {
  const prefix = base.endsWith('/') ? base : base + '/';
  for (const ch of course.chapters) {
    for (const sec of ch.sections) {
      for (const b of sec.blocks) {
        if ((b.type === 'image' || b.type === 'video' || b.type === 'audio') && /^voorbeelden\//.test(b.url)) {
          b.url = prefix + b.url;
        }
      }
    }
  }
  return course;
}

export function exampleCourseInstalled(): boolean {
  return Boolean(getCourse(EXAMPLE_COURSE_ID));
}

/**
 * Haalt het voorbeeldbestand op en zet de cursus (met haar flitskaarten) in
 * de bibliotheek. Bestaat ze al, dan wordt ze vervangen door de bundelversie
 * (de leerkracht kiest hier bewust voor: "opnieuw laden").
 */
export async function loadExampleCourse(): Promise<{ course: Course; widgets: Widget[] }> {
  // De app staat op een relatieve basis (vite base './'): de map van het
  // document is de basis, los van de hash-route.
  const base = new URL('.', document.baseURI).href;
  const res = await fetch(new URL(EXAMPLE_COURSE_FILE, base).href, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Voorbeeldcursus niet gevonden (${res.status})`);
  const bundle = importCourseJson(await res.text());
  if (!bundle) throw new Error('Het voorbeeldbestand is geen geldige cursus');
  absolutizeExampleUrls(bundle.course, base);
  adoptSharedCourse(bundle.course, bundle.widgets, { force: true });
  return bundle;
}
