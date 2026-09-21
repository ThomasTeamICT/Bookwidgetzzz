// ── AI-structurering van een leerplan ───────────────────────────────────────
//
// De leerkracht plakt een stuk leerplan- of minimumdoelentekst (of leest een
// pdf in); de AI zet die om in een nette doelenlijst met CODES. De code is de
// ruggengraat van de hele app (secties, vragen, dekking, klasoverzicht), dus
// officiële nummering blijft behouden waar ze in de tekst staat.
//
// Alles wat terugkomt gaat door de sanering hieronder: codes genormaliseerd,
// dubbels eruit, doelen zonder tekst weg. De leerkracht ziet altijd eerst een
// voorvertoning en beslist zelf wat bewaard wordt.

import type { CurriculumGoal } from './curriculumTypes';
import { sanitizeGoals } from './curriculum';

/** Meer tekst dan dit gaat niet mee (contextvenster + kosten). */
export const MAX_CURRICULUM_CHARS = 40000;

const SYSTEM = `Je bent een Vlaamse leerplanexpert die leerplanteksten omzet in een gestructureerde doelenlijst.
Regels:
- Neem de doelen LETTERLIJK over uit de tekst (hoogstens lichtjes ingekort tot één heldere doelzin). Verzin nooit doelen die er niet staan.
- Behoud de officiële codes/nummering exact zoals ze in de tekst staan (bv. "MD 6.12", "5.3.2", "LPD 14").
- Staat er geen nummering? Maak dan zelf korte, consequente codes.
- Groepeer per rubriek/thema/leerlijn zoals de tekst ze aangeeft ("theme").
- "level": "basis" voor gewone doelen, "uitbreiding" voor verdiepings-/uitbreidingsdoelen (als de tekst dat onderscheidt).
- "note": alleen een afbakening, voorbeeld of toelichting die in de tekst staat.
- Sla inleidingen, visieteksten, pedagogische duiding en bronvermeldingen over: alleen doelen.
Antwoord met ALLEEN geldige JSON, zonder uitleg en zonder markdown-hekken.`;

export interface CurriculumAIRequest {
  /** De geplakte of ingelezen leerplantekst. */
  text: string;
  /** Vak, bv. "Natuurwetenschappen" — bepaalt mee de afkorting in zelfgemaakte codes. */
  subject?: string;
  /** Niveau, bv. "1e graad A-stroom". */
  level?: string;
  /** Extra aanwijzing van de leerkracht, bv. "alleen hoofdstuk 3". */
  wishes?: string;
}

/**
 * Afkorting voor zelfgemaakte codes: "Natuurwetenschappen" → "NAT",
 * "Frans" → "FRA", "Project algemene vakken" → "PAV". Nooit leeg.
 */
export function subjectAbbrev(subject: string | undefined): string {
  const clean = (subject ?? '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  if (!clean) return 'DOEL';
  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
    if (initials.length >= 2) return initials;
  }
  return words[0].slice(0, 3).toUpperCase();
}

export function buildCurriculumPrompt(req: CurriculumAIRequest): { system: string; prompt: string } {
  const abbrev = subjectAbbrev(req.subject);
  const parts: string[] = [];
  parts.push('Haal alle leerplandoelen uit de onderstaande tekst en geef ze gestructureerd terug.');
  if (req.subject?.trim()) parts.push(`Vak: ${req.subject.trim()}`);
  if (req.level?.trim()) parts.push(`Niveau/doelgroep: ${req.level.trim()}`);
  if (req.wishes?.trim()) parts.push(`Extra aanwijzing van de leerkracht: ${req.wishes.trim()}`);
  parts.push(
    `Codes: staat er een officiële code of nummering bij een doel, neem die dan exact over. `
    + `Staat er geen enkele nummering in de tekst, maak dan zelf codes in de vorm "${abbrev} <themanummer>.<volgnummer>" `
    + `(bv. "${abbrev} 1.1", "${abbrev} 1.2", "${abbrev} 2.1"), waarbij het themanummer de volgorde van de rubrieken volgt.`
  );
  parts.push(
    'Geef terug: {"goals":[{"code":"…","text":"het doel zelf","theme":"rubriek of leerlijn","level":"basis"|"uitbreiding","note":"toelichting of leeg"}]}'
  );
  parts.push(`=== LEERPLANTEKST ===\n${req.text.trim().slice(0, MAX_CURRICULUM_CHARS)}\n=== EINDE TEKST ===`);
  return { system: SYSTEM, prompt: parts.join('\n\n') };
}

export interface AICurriculumResult {
  goals: CurriculumGoal[];
  warnings: string[];
}

/**
 * Het AI-antwoord omzetten in bruikbare doelen. Tolerant voor de vormen die
 * modellen in de praktijk teruggeven: {"goals":[…]}, {"doelen":[…]} of gewoon
 * een array. Nooit een uitzondering — hoogstens een lege lijst met uitleg.
 */
export function sanitizeAICurriculum(
  json: unknown,
  opts: { subject?: string } = {}
): AICurriculumResult {
  const warnings: string[] = [];
  let list: unknown = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && typeof json === 'object') {
    const env = json as Record<string, unknown>;
    const candidate = env.goals ?? env.doelen ?? env.leerplandoelen ?? env.curriculum ?? env.items;
    if (Array.isArray(candidate)) {
      list = candidate;
    } else if (candidate && typeof candidate === 'object' && Array.isArray((candidate as Record<string, unknown>).goals)) {
      list = (candidate as Record<string, unknown>).goals;
    }
  }
  const raw = Array.isArray(list) ? list : [];
  if (raw.length === 0) {
    return { goals: [], warnings: ['De AI gaf geen doelenlijst terug in het verwachte formaat. Probeer het opnieuw, of plak een kleiner stuk tekst.'] };
  }
  const goals = sanitizeGoals(raw, { autoPrefix: subjectAbbrev(opts.subject) });
  const dropped = raw.length - goals.length;
  if (dropped > 0) {
    warnings.push(`${dropped} regel(s) zijn weggelaten: leeg doel of dubbele code.`);
  }
  if (goals.length === 0) {
    warnings.push('Er bleef geen enkel bruikbaar doel over. Controleer of de tekst wel doelen bevat.');
  }
  const noTheme = goals.filter((g) => !g.theme).length;
  if (noTheme > 0 && noTheme < goals.length) {
    warnings.push(`${noTheme} doel(en) kregen geen rubriek — vul ze zelf aan als je per thema wil groeperen.`);
  }
  return { goals, warnings };
}
