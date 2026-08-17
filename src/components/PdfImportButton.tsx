// ── "Pdf inlezen"-knop voor bronmateriaal-velden ────────────────────────────
//
// Kleine knop + verborgen file-input: kiest een pdf, haalt er de tekst uit
// (client-side, via pdfText.ts) en geeft die via onText aan de aanroeper —
// die plakt ze doorgaans in een bronmateriaal-textarea. Fouten en succes
// worden als toast gemeld; tijdens het lezen is de knop bezig/uitgeschakeld.

import React, { useRef, useState } from 'react';
import { extractPdfText } from '../lib/pdfText';
import { useToast } from './ui';

const MAX_MB = 25;

export function PdfImportButton({ onText, className }: {
  onText: (text: string) => void;
  className?: string;
}): JSX.Element {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function readFile(f: File) {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast('Kies een pdf-bestand.', 'err');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast(`Deze pdf is groter dan ${MAX_MB} MB. Verklein hem (bv. exporteer opnieuw met lagere kwaliteit).`, 'err');
      return;
    }
    setBusy(true);
    try {
      const { text, pages } = await extractPdfText(f);
      if (!text.trim()) {
        toast('Geen leesbare tekst gevonden — is dit een gescande pdf (foto’s van pagina’s)?', 'err');
        return;
      }
      onText(text);
      toast(`✓ ${pages} pagina${pages === 1 ? '' : '’s'} ingelezen — kijk de tekst even na`, 'ok');
    } catch {
      toast('Deze pdf kon niet gelezen worden. Is het bestand beschadigd?', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className ?? 'btn btn-sm btn-ghost'}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? '⏳ Pdf lezen…' : '📄 Pdf inlezen'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = ''; // zelfde bestand opnieuw kiezen moet ook werken
        }}
      />
    </>
  );
}
