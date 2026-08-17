// ── Pdf-tekstextractie (voor AI-bronmateriaal) ──────────────────────────────
//
// Leest alle tekst uit een pdf met pdf.js, volledig client-side. Bedoeld om
// een hoofdstuk of cursustekst als bronmateriaal in de AI-velden te plakken.
// Let op: een gescande pdf (foto's van pagina's) bevat geen tekstlaag en
// levert dus (bijna) niets op — de knop meldt dat aan de leerkracht.

/** Meer dan dit plakken we niet in een AI-prompt (± 15k tokens). */
const MAX_CHARS = 60000;
const TRUNC_MARKER = '\n\n[… ingekort …]';

/**
 * Haalt de tekst uit alle pagina's van een pdf.
 * - items per pagina samengevoegd met spaties, whitespace genormaliseerd
 * - pagina's gescheiden door een witregel, met kopje "— p. n —" (alleen bij >1 pagina)
 * - afgekapt op 60.000 tekens met een duidelijke marker
 */
export async function extractPdfText(src: Blob): Promise<{ text: string; pages: number }> {
  // De legacy-build, net als PdfViewer: de moderne build eist splinternieuwe
  // JS-API's die op oudere school-pc's nog ontbreken.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const data = await src.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const pages = doc.numPages;
    const parts: string[] = [];
    let total = 0;
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!pageText) continue; // lege (of gescande) pagina: geen loos kopje
      const part = pages > 1 ? `— p. ${n} —\n${pageText}` : pageText;
      parts.push(part);
      total += part.length;
      if (total > MAX_CHARS) break; // genoeg gelezen; de rest valt toch buiten de limiet
    }
    let text = parts.join('\n\n');
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS - TRUNC_MARKER.length) + TRUNC_MARKER;
    }
    return { text, pages };
  } finally {
    try { await task.destroy(); } catch { /* al opgeruimd */ }
  }
}
