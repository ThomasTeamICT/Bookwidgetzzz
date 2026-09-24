// ── Leerplannen: het gedeelde doelenregister ────────────────────────────────
//
// Eén leerplan = een lijst doelen met een stabiele CODE. Die code is de ruggen-
// graat waarlangs alles met elkaar praat: een cursussectie draagt goalCodes,
// een quizvraag draagt een goalCode, een inzending levert dus score per doel,
// en het klasoverzicht telt dat op per leerling. Vrije-teksttags (goals /
// goal) blijven bestaan voor wie geen leerplan gebruikt.

export type CurriculumNet = 'minimumdoelen' | 'go' | 'kov' | 'ovsg' | 'pov' | 'eigen';

export const CURRICULUM_NETS: { id: CurriculumNet; label: string; hint: string }[] = [
  { id: 'minimumdoelen', label: 'Minimumdoelen (Vlaamse overheid)', hint: 'onderwijsdoelen.be — de wettelijke basis voor elk net' },
  { id: 'go', label: 'GO! leerplan', hint: 'pro.g-o.be' },
  { id: 'kov', label: 'Katholiek Onderwijs Vlaanderen', hint: 'leerplannen KOV / ZILL (basis)' },
  { id: 'ovsg', label: 'OVSG (stedelijk & gemeentelijk)', hint: 'ovsg.be' },
  { id: 'pov', label: 'POV (provinciaal)', hint: 'pov.be' },
  { id: 'eigen', label: 'Eigen leerplan', hint: 'vakgroep, school of jezelf' },
];

export interface CurriculumGoal {
  id: string;
  /** Stabiele code zoals in het leerplan, bv. "WIS 2.3" of "MD 6.12". Uniek binnen het leerplan. */
  code: string;
  /** Het doel zelf, liefst letterlijk uit het leerplan. */
  text: string;
  /** Rubriek / leerlijn / thema, bv. "Getallenleer". */
  theme?: string;
  /** Basis (voor iedereen) of uitbreiding (verdieping). */
  level?: 'basis' | 'uitbreiding';
  /** Eventuele toelichting of afbakening uit het leerplan. */
  note?: string;
}

export interface Curriculum {
  id: string;
  title: string;
  net: CurriculumNet;
  /** Vak, bv. "Wiskunde". */
  subject: string;
  /** Niveau, bv. "1e graad A-stroom" of "3e leerjaar". */
  level: string;
  /** Herkomst: url, documentnaam, versie/jaar. */
  source?: string;
  /** Voorbeeldmateriaal dat met de app meekomt (niet het officiële document). */
  example?: boolean;
  goals: CurriculumGoal[];
  createdAt: number;
  updatedAt: number;
}
