import React from 'react';
import type { StudyFigureKind } from '../../lib/studyTypes';

// ── Tekeningen bij de theorie ───────────────────────────────────────────────
//
// Eigen svg's, bewust in dezelfde beeldtaal als de cursus: het origineel in
// oranje, het beeld in groen, hulplijnen stippellijn. Ze schalen mee met de
// kolom en gebruiken de themakleuren, dus ze blijven leesbaar in donker thema.
// Elke tekening heeft een tekstalternatief: wie ze niet ziet, mist niets.

const ORIG = 'var(--warn)';
const BEELD = 'var(--ok)';
const HELP = 'var(--text-faint)';
const LIJN = 'var(--text-soft)';

function Punt({ x, y, kleur, naam, dx = 8, dy = -8 }: {
  x: number; y: number; kleur: string; naam: string; dx?: number; dy?: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill={kleur} />
      <text x={x + dx} y={y + dy} fill={kleur} fontSize="15" fontWeight="700" fontStyle="italic">{naam}</text>
    </g>
  );
}

function pad(punten: [number, number][]): string {
  return punten.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Spiegeling om een verticale as: elk punt even ver aan de andere kant. */
function Spiegeling() {
  const links: [number, number][] = [[55, 40], [45, 125], [120, 95]];
  const rechts: [number, number][] = links.map(([x, y]) => [320 - x, y]);
  return (
    <>
      {/* spiegelas */}
      <line x1="160" y1="12" x2="160" y2="168" stroke={LIJN} strokeWidth="2" />
      <text x="168" y="26" fill={LIJN} fontSize="15" fontStyle="italic" fontWeight="700">a</text>
      {links.map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={320 - x} y2={y} stroke={HELP} strokeWidth="1.4" strokeDasharray="4 4" />
          {/* gelijke afstanden tot de as */}
          <line x1={(x + 160) / 2} y1={y - 5} x2={(x + 160) / 2} y2={y + 5} stroke={HELP} strokeWidth="1.4" />
          <line x1={(320 - x + 160) / 2} y1={y - 5} x2={(320 - x + 160) / 2} y2={y + 5} stroke={HELP} strokeWidth="1.4" />
        </g>
      ))}
      <polygon points={pad(links)} fill="none" stroke={ORIG} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points={pad(rechts)} fill="none" stroke={BEELD} strokeWidth="2.5" strokeLinejoin="round" />
      <Punt x={55} y={40} kleur={ORIG} naam="A" dx={-20} dy={-6} />
      <Punt x={265} y={40} kleur={BEELD} naam="A′" dx={8} dy={-6} />
    </>
  );
}

/** Translatie: alle verbindingspijlen even lang, evenwijdig en met dezelfde zin. */
function Translatie() {
  const dx = 140;
  const dy = -32;
  const origineel: [number, number][] = [[30, 118], [56, 58], [106, 66], [96, 128]];
  const beeld: [number, number][] = origineel.map(([x, y]) => [x + dx, y + dy]);
  return (
    <>
      <defs>
        <marker id="wf-pijl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={HELP} />
        </marker>
        <marker id="wf-pijl-sterk" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={LIJN} />
        </marker>
      </defs>
      {origineel.map(([x, y], i) => (
        <line
          key={i} x1={x} y1={y} x2={x + dx} y2={y + dy}
          stroke={HELP} strokeWidth="1.4" strokeDasharray="4 4" markerEnd="url(#wf-pijl)"
        />
      ))}
      <polygon points={pad(origineel)} fill="none" stroke={ORIG} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points={pad(beeld)} fill="none" stroke={BEELD} strokeWidth="2.5" strokeLinejoin="round" />
      {/* de vector zelf, los getekend */}
      <line x1="28" y1="168" x2="168" y2="136" stroke={LIJN} strokeWidth="2.5" markerEnd="url(#wf-pijl-sterk)" />
      <Punt x={28} y={168} kleur={LIJN} naam="X" dx={-6} dy={-10} />
      <Punt x={168} y={136} kleur={LIJN} naam="Y" dx={8} dy={0} />
    </>
  );
}

/** Rotatie over 90° in tegenwijzerzin rond O. */
function Rotatie() {
  const O: [number, number] = [160, 158];
  const P: [number, number] = [270, 128];
  // Visueel tegenwijzerzin over 90°: (x, y) → (y, −x) t.o.v. het centrum.
  const v: [number, number] = [P[0] - O[0], P[1] - O[1]];
  const Pa: [number, number] = [O[0] + v[1], O[1] - v[0]];
  const r = Math.round(Math.hypot(v[0], v[1]));
  return (
    <>
      <defs>
        <marker id="wf-boogpijl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={LIJN} />
        </marker>
      </defs>
      <line x1={O[0]} y1={O[1]} x2={P[0]} y2={P[1]} stroke={HELP} strokeWidth="1.4" strokeDasharray="4 4" />
      <line x1={O[0]} y1={O[1]} x2={Pa[0]} y2={Pa[1]} stroke={HELP} strokeWidth="1.4" strokeDasharray="4 4" />
      {/* boog van P naar P′, sweep 0 = tegenwijzerzin op het scherm */}
      <path
        d={`M ${P[0]} ${P[1]} A ${r} ${r} 0 0 0 ${Pa[0]} ${Pa[1]}`}
        fill="none" stroke={LIJN} strokeWidth="2" markerEnd="url(#wf-boogpijl)"
      />
      <text x={O[0] + 12} y={O[1] - 42} fill={LIJN} fontSize="15" fontWeight="700">α = 90°</text>
      <circle cx={O[0]} cy={O[1]} r={4} fill={LIJN} />
      <text x={O[0] - 6} y={O[1] + 20} fill={LIJN} fontSize="15" fontWeight="700" fontStyle="italic">O</text>
      <Punt x={P[0]} y={P[1]} kleur={ORIG} naam="P" dx={8} dy={-6} />
      <Punt x={Pa[0]} y={Pa[1]} kleur={BEELD} naam="P′" dx={-30} dy={-6} />
    </>
  );
}

/** Puntspiegeling: O is het midden van [PP′] — hetzelfde als 180° draaien. */
function Puntspiegeling() {
  const O: [number, number] = [160, 92];
  const origineel: [number, number][] = [[48, 34], [104, 24], [86, 78]];
  const beeld: [number, number][] = origineel.map(([x, y]) => [2 * O[0] - x, 2 * O[1] - y]);
  return (
    <>
      {origineel.map(([x, y], i) => {
        const [bx, by] = beeld[i];
        // streepje halverwege elk halflijnstuk: de afstanden zijn gelijk
        const m1: [number, number] = [(x + O[0]) / 2, (y + O[1]) / 2];
        const m2: [number, number] = [(bx + O[0]) / 2, (by + O[1]) / 2];
        return (
          <g key={i}>
            <line x1={x} y1={y} x2={bx} y2={by} stroke={HELP} strokeWidth="1.4" strokeDasharray="4 4" />
            <circle cx={m1[0]} cy={m1[1]} r="2.5" fill={HELP} />
            <circle cx={m2[0]} cy={m2[1]} r="2.5" fill={HELP} />
          </g>
        );
      })}
      <polygon points={pad(origineel)} fill="none" stroke={ORIG} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points={pad(beeld)} fill="none" stroke={BEELD} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={O[0]} cy={O[1]} r={4.5} fill={LIJN} />
      <text x={O[0] + 9} y={O[1] + 18} fill={LIJN} fontSize="15" fontWeight="700" fontStyle="italic">O</text>
      <Punt x={origineel[0][0]} y={origineel[0][1]} kleur={ORIG} naam="P" dx={-20} dy={-4} />
      <Punt x={beeld[0][0]} y={beeld[0][1]} kleur={BEELD} naam="P′" dx={8} dy={14} />
    </>
  );
}

const TEKENING: Record<StudyFigureKind, {
  teken: () => React.JSX.Element;
  /** Volledige beschrijving voor wie de tekening niet ziet. */
  alt: string;
  /** Korte regel onder de tekening. */
  kort: string;
  hoogte: number;
}> = {
  spiegeling: {
    teken: Spiegeling,
    hoogte: 180,
    kort: 'Even ver van de as, loodrecht erop — en het beeld staat omgekeerd.',
    alt: 'Een driehoek links van een verticale spiegelas a en zijn spiegelbeeld rechts ervan. '
      + 'Stippellijnen verbinden elk punt met zijn beeld en staan loodrecht op de as; '
      + 'de afstand van een punt tot de as is even groot als die van zijn beeld.',
  },
  translatie: {
    teken: Translatie,
    hoogte: 180,
    kort: 'Alle pijlen even lang, evenwijdig en in dezelfde zin als de vector XY.',
    alt: 'Een vierhoek en zijn beeld, verschoven naar rechtsboven. De verbindingspijlen tussen '
      + 'de hoekpunten zijn even lang, evenwijdig en wijzen dezelfde kant uit, net als de vector XY eronder.',
  },
  rotatie: {
    teken: Rotatie,
    hoogte: 180,
    kort: '90° in tegenwijzerzin: r(O, 90°). |OP| = |OP′|.',
    alt: 'Punt P draait over een boog van 90° in tegenwijzerzin rond het centrum O naar zijn beeld P-accent. '
      + 'De afstanden van O tot P en van O tot P-accent zijn even groot.',
  },
  puntspiegeling: {
    teken: Puntspiegeling,
    hoogte: 184,
    kort: 'O ligt precies in het midden tussen elk punt en zijn beeld.',
    alt: 'Een driehoek en zijn beeld liggen puntsymmetrisch rond het centrum O. Elke stippellijn loopt '
      + 'door O en O ligt precies in het midden tussen een punt en zijn beeld.',
  },
};

export function StudyFigure({ kind, caption }: { kind: StudyFigureKind; caption?: string }) {
  const def = TEKENING[kind];
  const Teken = def.teken;
  return (
    <figure className="study-figure">
      <svg viewBox={`0 0 320 ${def.hoogte}`} role="img" aria-label={def.alt} width="100%">
        <Teken />
      </svg>
      <figcaption>{caption ?? def.kort}</figcaption>
    </figure>
  );
}
