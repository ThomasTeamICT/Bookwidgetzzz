// ── Veilige mini-markdown voor cursusblokken ────────────────────────────────
//
// Bewust klein gehouden: alle HTML wordt eerst ontsmet (ge-escaped) en pas
// daarna worden een handvol markdown-patronen omgezet. Zo kan er nooit
// script of opmaak uit bronmateriaal in de pagina belanden.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('#/')) return u; // interne app-link
  return null;
}

/** Inline-opmaak binnen één regel: **vet**, *cursief*, `code`, [tekst](url). */
function inline(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return label;
    const external = safe.startsWith('http');
    return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  return s;
}

/**
 * Zet een markdown-tekst om naar veilige HTML.
 * Ondersteunt alinea's, - en 1. lijsten, ### koppen en > citaten.
 */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // koppen
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(4, h[1].length + 1); // ## → h3, ### → h4
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // ongeordende lijst
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // geordende lijst
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // citaat
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(inline(lines[i].replace(/^\s*>\s?/, '')));
        i++;
      }
      out.push(`<blockquote>${quoted.join('<br/>')}</blockquote>`);
      continue;
    }
    // alinea (opeenvolgende niet-lege regels samenvoegen met <br/>)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4})\s|^\s*[-*]\s+|^\s*\d+[.)]\s+|^\s*>\s?/.test(lines[i])) {
      para.push(inline(lines[i]));
      i++;
    }
    out.push(`<p>${para.join('<br/>')}</p>`);
  }
  return out.join('\n');
}
