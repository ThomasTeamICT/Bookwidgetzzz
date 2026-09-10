// ── Datamodel van de leerstofmodule ─────────────────────────────────────────
//
// Een apart onderdeel van de app, met een ander doel dan de rest: hier maakt
// een ouder (of leerling) géén oefening voor een klas, maar houdt hij per
// toets bij wát er gekend moet zijn — samenvatting, begrippen, valkuilen en
// overhoorvragen. Bewust plat gehouden: velden invullen moet sneller gaan dan
// blokken slepen, want dit gebeurt op een doordeweekse avond.
//
// Alles staat lokaal (zie lib/study.ts). Foto's van cursusbladzijden blijven
// in IndexedDB op het toestel zelf: ze horen niet in een repo of op een
// publieke site thuis (auteursrecht van de uitgever).

/** Ingebouwde tekeningen bij de theorie (eigen svg, zie components/study/StudyFigure). */
export type StudyFigureKind = 'spiegeling' | 'translatie' | 'rotatie' | 'puntspiegeling';

export const FIGURE_LABEL: Record<StudyFigureKind, string> = {
  spiegeling: 'Spiegeling om een as',
  translatie: 'Translatie over een vector',
  rotatie: 'Rotatie rond een centrum',
  puntspiegeling: 'Puntspiegeling',
};

/** Eén stuk theorie: een kop met tekst (mini-markdown), eventueel met tekening. */
export interface StudySection {
  id: string;
  titel: string;
  markdown: string;
  /** Ingebouwde tekening onder de tekst. */
  figuur?: StudyFigureKind;
  /** Nog aan te vullen (bv. bladzijden die nog niet ingelezen zijn). */
  todo?: boolean;
}

/** Rij uit de notatietabel: symbool ↔ hoe je het leest. */
export interface StudyNotation {
  id: string;
  symbool: string;
  betekenis: string;
}

/** Begrip uit de wiskundetaal — wordt ook als flitskaart overhoord. */
export interface StudyTerm {
  id: string;
  term: string;
  uitleg: string;
}

/** Valkuil of aandachtspunt, vaak een fout uit een verbeterde oefening. */
export interface StudyPitfall {
  id: string;
  tekst: string;
}

/** Overhoorvraag: lezen, zelf antwoorden, antwoord tonen, eerlijk beoordelen. */
export interface StudyQuestion {
  id: string;
  vraag: string;
  antwoord: string;
  /** Extra uitleg of geheugensteun bij het antwoord. */
  uitleg?: string;
  /** Waar de vraag vandaan komt, bv. "oef. 6a, blz. 9". */
  bron?: string;
}

/** Wat er gekend moet zijn: afvinkbaar doel. */
export interface StudyGoal {
  id: string;
  tekst: string;
}

/** Eigen foto van een cursusbladzijde (blijft op dit toestel). */
export interface StudyPhoto {
  id: string;
  url: string;
  bijschrift?: string;
}

/** Eén leerstofonderdeel = doorgaans één toets. */
export interface StudyTopic {
  id: string;
  /** Voor wie: zo blijft het bruikbaar met meerdere kinderen. */
  leerling: string;
  vak: string;
  titel: string;
  /** Boek, module, bladzijden. */
  bron?: string;
  emoji: string;
  kleur: string;
  /** Toetsdatum als 'JJJJ-MM-DD' (leeg = nog niet gekend). */
  toetsDatum?: string;
  /** Handmatig afgesloten: het onderdeel is gegeven en verbeterd. */
  gearchiveerd?: boolean;
  doelen: StudyGoal[];
  secties: StudySection[];
  notaties: StudyNotation[];
  begrippen: StudyTerm[];
  valkuilen: StudyPitfall[];
  vragen: StudyQuestion[];
  fotos: StudyPhoto[];
  notitie?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Voortgang ───────────────────────────────────────────────────────────────

/** Stand van één overhoorbaar item (vraag of begrip). */
export interface ItemMastery {
  goed: number;
  fout: number;
  /** Door de leerling zelf op "gekend" gezet bij de laatste beurt. */
  gekend: boolean;
  laatst: number;
}

export interface StudySession {
  at: number;
  soort: 'vragen' | 'begrippen';
  goed: number;
  totaal: number;
}

export interface StudyProgress {
  topicId: string;
  /** Afgevinkte doel-ids. */
  doelen: string[];
  vragen: Record<string, ItemMastery>;
  begrippen: Record<string, ItemMastery>;
  /** Laatste overhoorbeurten, nieuwste eerst (afgekapt op MAX_SESSIONS). */
  sessies: StudySession[];
  laatstGestudeerd?: number;
}

/** Hoeveel overhoorbeurten we bijhouden — genoeg voor een trend, niet meer. */
export const MAX_SESSIONS = 20;

export function emptyProgress(topicId: string): StudyProgress {
  return { topicId, doelen: [], vragen: {}, begrippen: {}, sessies: [] };
}

// ── Afgeleide gegevens ──────────────────────────────────────────────────────

/** Middernacht van een 'JJJJ-MM-DD'-datum in de lokale tijdzone. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function parseDateOnly(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, da] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(da));
  // 31 februari bestaat niet: de Date rolt door, dus controleren we terug.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(da)) {
    return null;
  }
  return date;
}

/**
 * Aantal kalenderdagen tot de toets: 0 = vandaag, 1 = morgen, negatief = voorbij.
 * Rekent in hele dagen (lokale tijd), dus een toets "vanavond" blijft vandaag.
 */
export function daysUntil(iso: string | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const date = parseDateOnly(iso);
  if (!date) return null;
  const diff = startOfDay(date) - startOfDay(new Date(now));
  return Math.round(diff / 86400000);
}

export interface Countdown {
  dagen: number;
  label: string;
  /** urgent = vandaag of morgen, dichtbij = binnen de week, voorbij = geweest. */
  toon: 'voorbij' | 'urgent' | 'dichtbij' | 'ver';
}

export function countdown(iso: string | undefined, now: number = Date.now()): Countdown | null {
  const dagen = daysUntil(iso, now);
  if (dagen === null) return null;
  if (dagen < 0) {
    const geleden = -dagen;
    return {
      dagen,
      label: geleden === 1 ? 'gisteren geweest' : `${geleden} dagen geleden geweest`,
      toon: 'voorbij',
    };
  }
  if (dagen === 0) return { dagen, label: 'vandaag', toon: 'urgent' };
  if (dagen === 1) return { dagen, label: 'morgen', toon: 'urgent' };
  if (dagen <= 7) return { dagen, label: `over ${dagen} dagen`, toon: 'dichtbij' };
  return { dagen, label: `over ${dagen} dagen`, toon: 'ver' };
}

export interface Mastery {
  /** Aantal items dat als gekend gemarkeerd staat. */
  gekend: number;
  totaal: number;
  percent: number;
}

function countMastery(ids: string[], stand: Record<string, ItemMastery>): Mastery {
  const totaal = ids.length;
  const gekend = ids.filter((id) => stand[id]?.gekend).length;
  return { gekend, totaal, percent: totaal === 0 ? 0 : Math.round((gekend / totaal) * 100) };
}

export function questionMastery(topic: StudyTopic, progress: StudyProgress | undefined): Mastery {
  return countMastery(topic.vragen.map((v) => v.id), progress?.vragen ?? {});
}

export function termMastery(topic: StudyTopic, progress: StudyProgress | undefined): Mastery {
  return countMastery(topic.begrippen.map((b) => b.id), progress?.begrippen ?? {});
}

/**
 * Eén cijfer voor "hoe ver sta ik?": doelen, vragen en begrippen samen, elk
 * item even zwaar. Onderdelen die leeg zijn tellen niet mee — anders zou een
 * onderdeel zónder begrippen nooit aan 100% raken.
 */
export function overallMastery(topic: StudyTopic, progress: StudyProgress | undefined): Mastery {
  const q = questionMastery(topic, progress);
  const t = termMastery(topic, progress);
  const doelenTotaal = topic.doelen.length;
  const doelenGekend = progress ? topic.doelen.filter((d) => progress.doelen.includes(d.id)).length : 0;
  const totaal = q.totaal + t.totaal + doelenTotaal;
  const gekend = q.gekend + t.gekend + doelenGekend;
  return { gekend, totaal, percent: totaal === 0 ? 0 : Math.round((gekend / totaal) * 100) };
}

export type StudyState = 'nieuw' | 'bezig' | 'klaar';

export function studyState(topic: StudyTopic, progress: StudyProgress | undefined): StudyState {
  const { percent, totaal } = overallMastery(topic, progress);
  if (totaal === 0 || !progress?.laatstGestudeerd) return 'nieuw';
  return percent >= 90 ? 'klaar' : 'bezig';
}

export const STATE_LABEL: Record<StudyState, string> = {
  nieuw: 'Nog niet gestudeerd',
  bezig: 'Bezig',
  klaar: 'Zo goed als gekend',
};

/**
 * Volgorde op het overzicht: wat het eerst gegeven wordt, staat bovenaan.
 * Onderdelen zonder datum komen daarna (die moeten nog een datum krijgen),
 * voorbije toetsen sluiten de rij.
 */
export function sortTopics(topics: StudyTopic[], now: number = Date.now()): StudyTopic[] {
  const rang = (t: StudyTopic): number => {
    const d = daysUntil(t.toetsDatum, now);
    if (t.gearchiveerd) return 3;
    if (d === null) return 1;
    return d < 0 ? 2 : 0;
  };
  return topics.slice().sort((a, b) => {
    const ra = rang(a);
    const rb = rang(b);
    if (ra !== rb) return ra - rb;
    const da = daysUntil(a.toetsDatum, now);
    const db = daysUntil(b.toetsDatum, now);
    if (da !== null && db !== null && da !== db) {
      // Voorbije toetsen: het meest recente eerst; toekomstige: het eerstvolgende eerst.
      return ra === 2 ? db - da : da - db;
    }
    return b.updatedAt - a.updatedAt;
  });
}

/** Alle vakken die in gebruik zijn (voor filters en invulhulp). */
export function usedSubjects(topics: StudyTopic[]): string[] {
  return [...new Set(topics.map((t) => t.vak.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
}

/** Alle leerlingen die in gebruik zijn. */
export function usedLearners(topics: StudyTopic[]): string[] {
  return [...new Set(topics.map((t) => t.leerling.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
}
