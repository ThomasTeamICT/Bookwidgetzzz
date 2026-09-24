// ── Detecteert opmaak in vrije tekst ─────────────────────────────────────────
//
// Gebruikt door de cursuseditor: het voorbeeld van een tekstblok verschijnt
// automatisch alleen als de tekst zelf al opmaak bevat (koppen, lijsten, vet,
// links, tabellen, afbeeldingen, citaten). Kale tekst — een paar zinnen zonder
// opmaak — toont geen voorbeeld: dat zou gewoon dezelfde tekst herhalen.

const FORMATTING_PATTERNS: RegExp[] = [
  /^\s{0,3}#{1,6}\s+\S/m, // kop: # .. ######
  /^\s*[-*]\s+\S/m, // ongeordende lijst
  /^\s*\d+[.)]\s+\S/m, // geordende lijst
  /\*\*[^*\n]+\*\*/, // vet
  /!\[[^\]]*\]\([^)\s]+\)/, // afbeelding
  /\[[^\]]+\]\([^)\s]+\)/, // link
  /^\s*\|.+\|\s*$/m, // tabel
  /^\s*>\s?\S/m, // citaat
];

/**
 * True als de tekst minstens één markdown-patroon bevat: een kop, een lijst,
 * vet, een link, een tabel, een afbeelding of een citaat. Lege tekst of platte
 * zinnen zonder opmaak geven false.
 */
export function hasMarkdownFormatting(text: string): boolean {
  const t = text ?? '';
  if (!t.trim()) return false;
  return FORMATTING_PATTERNS.some((re) => re.test(t));
}
