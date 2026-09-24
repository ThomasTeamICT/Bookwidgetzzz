// ── Titelvoorstel bij "Omzetten naar cursus" ────────────────────────────────
//
// Vroeger kreeg een cursus zonder AI automatisch de naam van haar eerste
// hoofdstuk (de eerste kop in het document). Nu vraagt de importpagina de
// titel expliciet, met een voorstel: de eerste duidelijke kop als die er is,
// anders de titel van de bron (meestal de bestandsnaam zonder extensie).

/** Zoekt de eerste markdown-kop (#, ## … tot ######) in een tekst. */
export function firstHeadingTitle(markdown: string): string | undefined {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[1].trim();
      if (text) return text;
    }
  }
  return undefined;
}

/**
 * Voorstel voor de cursustitel: de eerste kop in het document als die er is,
 * anders de meegegeven terugvaltitel (doorgaans de bestandsnaam zonder
 * extensie). Beide leeg → 'Nieuwe cursus'.
 */
export function suggestCourseTitle(markdown: string, fallbackTitle: string): string {
  return firstHeadingTitle(markdown) || fallbackTitle.trim() || 'Nieuwe cursus';
}
