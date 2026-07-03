import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubmissions, getWidgets, onStorageChange } from '../lib/storage';
import type { Submission } from '../lib/types';
import { EmptyState } from '../components/ui';
import { formatDate, pct } from '../lib/utils';

/**
 * "Mijn voortgang" voor de leerling op dit toestel.
 *
 * Didactische keuze: we vergelijken uitsluitend met de eigen eerdere pogingen
 * van de leerling — nooit met klasgemiddelden of andere leerlingen. Groei ten
 * opzichte van jezelf motiveert; ranglijstjes doen dat zelden.
 */

interface WidgetGroep {
  widgetId: string;
  widgetCode: string;
  /** null wanneer de widget niet (meer) op dit toestel staat (bv. gespeeld via draagbare link). */
  titel: string | null;
  /** Pogingen van deze leerling, oudste eerst. */
  pogingen: Submission[];
  /** submittedAt van de nieuwste poging (voor sortering). */
  laatste: number;
}

function scoreKleur(p: number): string {
  return p >= 70 ? 'var(--ok)' : p >= 45 ? 'var(--warn)' : 'var(--err)';
}

export function ProgressPage() {
  // Live meebewegen wanneer er (in een ander tabblad) een inzending bijkomt.
  const [tick, setTick] = useState(0);
  useEffect(() => onStorageChange(() => setTick((t) => t + 1)), []);

  const subs = useMemo(
    () => getSubmissions().slice().sort((a, b) => b.submittedAt - a.submittedAt),
    [tick]
  );
  const widgetTitels = useMemo(() => {
    const map = new Map<string, string>();
    getWidgets().forEach((w) => map.set(w.id, w.title));
    return map;
  }, [tick]);

  // Alle namen die op dit toestel iets indienden, meest recente eerst.
  const namen = useMemo(() => {
    const gezien = new Set<string>();
    const out: string[] = [];
    for (const s of subs) {
      const key = s.studentName.trim().toLowerCase();
      if (!gezien.has(key)) {
        gezien.add(key);
        out.push(s.studentName);
      }
    }
    return out;
  }, [subs]);

  const [gekozen, setGekozen] = useState<string | null>(null);
  // canonieke schrijfwijze teruggeven: anders toont de select niets wanneer
  // dezelfde naam later met andere hoofdletters opnieuw indient
  const actieveNaam =
    (gekozen && namen.find((n) => n.toLowerCase() === gekozen.toLowerCase())) || (namen[0] ?? '');

  const groepen = useMemo<WidgetGroep[]>(() => {
    const mijn = subs.filter(
      (s) => s.studentName.trim().toLowerCase() === actieveNaam.trim().toLowerCase()
    );
    const map = new Map<string, WidgetGroep>();
    for (const s of mijn) {
      let g = map.get(s.widgetId);
      if (!g) {
        g = {
          widgetId: s.widgetId,
          widgetCode: s.widgetCode,
          titel: widgetTitels.get(s.widgetId) ?? null,
          pogingen: [],
          laatste: 0,
        };
        map.set(s.widgetId, g);
      }
      g.pogingen.push(s);
      g.laatste = Math.max(g.laatste, s.submittedAt);
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.pogingen.sort((a, b) => a.submittedAt - b.submittedAt));
    arr.sort((a, b) => b.laatste - a.laatste);
    return arr;
  }, [subs, actieveNaam, widgetTitels]);

  return (
    <div className="player-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="player-topbar">
        <Link to="/" className="topbar-logo" style={{ fontSize: '1rem' }}>
          <span className="logo-mark" aria-hidden style={{ width: 28, height: 28, fontSize: '0.9rem' }}>🧩</span>
          WidgetFabriek
        </Link>
        <span className="title">Mijn voortgang</span>
        <Link to="/meedoen" className="btn btn-sm btn-ghost">🎓 Meedoen</Link>
      </header>

      <div className="player-main">
        <h1 style={{ fontSize: '1.5rem' }}>📈 Mijn voortgang</h1>

        {subs.length === 0 ? (
          <EmptyState icon="🌱" title="Nog geen voortgang op dit toestel">
            <p>
              Zodra je hier een opdracht maakt, zie je op deze pagina al je pogingen en hoe je groeit.
              Je voortgang wordt <strong>per toestel</strong> bewaard: werkte je eerder op een ander
              toestel, dan staat je voortgang daar.
            </p>
            <Link to="/meedoen" className="btn btn-primary">🎓 Meedoen met een opdracht</Link>
          </EmptyState>
        ) : (
          <>
            <p style={{ color: 'var(--text-soft)' }}>
              Je vergelijkt hier alleen met je <strong>eigen eerdere pogingen</strong> — niet met
              anderen. Groeien doe je ten opzichte van jezelf.
            </p>

            <div className="field" style={{ maxWidth: 340 }}>
              <label htmlFor="voortgang-naam">Wie ben jij?</label>
              <select
                id="voortgang-naam"
                className="select"
                value={actieveNaam}
                onChange={(e) => setGekozen(e.target.value)}
              >
                {namen.map((n) => (
                  <option key={n.toLowerCase()} value={n}>{n}</option>
                ))}
              </select>
              <span className="hint">Alle namen die op dit toestel een opdracht maakten.</span>
            </div>

            {groepen.length === 0 ? (
              <EmptyState icon="🔎" title="Geen inzendingen voor deze naam">
                <p>Kies hierboven een andere naam.</p>
              </EmptyState>
            ) : (
              groepen.map((g) => <WidgetGroepKaart key={g.widgetId} groep={g} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WidgetGroepKaart({ groep }: { groep: WidgetGroep }) {
  const naam = groep.titel ?? `opdracht met code ${groep.widgetCode}`;

  // Groei: nieuwste scorebare poging t.o.v. de éérste scorebare poging.
  const metScore = groep.pogingen.filter((p) => p.totalMax > 0);
  let groei: number | null = null;
  if (metScore.length >= 2) {
    const eerste = pct(metScore[0].totalEarned, metScore[0].totalMax);
    const laatste = pct(metScore[metScore.length - 1].totalEarned, metScore[metScore.length - 1].totalMax);
    groei = laatste - eerste;
  }

  return (
    <section className="card card-pad" style={{ marginTop: 16 }} aria-label={`Voortgang voor ${naam}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', flex: 1, minWidth: 180 }}>
          {groep.titel ?? (
            <>
              Opdracht met code{' '}
              <span style={{ fontFamily: 'monospace' }}>{groep.widgetCode}</span>
            </>
          )}
        </h2>
        {groei !== null && (
          <span
            className={`badge ${groei > 0 ? 'badge-ok' : groei < 0 ? 'badge-warn' : 'badge-brand'}`}
            role="status"
          >
            {groei > 0
              ? `↗ +${groei}% t.o.v. je eerste poging`
              : groei < 0
                ? `↘ ${groei}% t.o.v. je eerste poging`
                : '→ gelijk aan je eerste poging'}
          </span>
        )}
      </div>
      {!groep.titel && (
        <p className="hint" style={{ color: 'var(--text-soft)', fontSize: '0.82rem', margin: '0 0 6px' }}>
          Deze widget staat niet (meer) op dit toestel — je speelde ze wellicht via een draagbare link.
        </p>
      )}

      <div role="list" aria-label={`Pogingen voor ${naam}`}>
        {groep.pogingen.map((p, i) => {
          const procent = p.totalMax > 0 ? pct(p.totalEarned, p.totalMax) : null;
          return (
            <div
              key={p.id}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '9px 0',
                borderBottom: i < groep.pogingen.length - 1 ? '1px solid var(--line)' : 'none',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem', minWidth: 74 }}>Poging {i + 1}</span>
              <span style={{ color: 'var(--text-soft)', fontSize: '0.85rem', minWidth: 128 }}>
                {formatDate(p.submittedAt)}
              </span>
              {procent === null ? (
                <span style={{ color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                  — geen score bij deze opdracht
                </span>
              ) : (
                <div
                  className="scorebar"
                  style={{ flex: 1 }}
                  role="img"
                  aria-label={`Score: ${procent} procent (${p.totalEarned} van ${p.totalMax} punten)`}
                >
                  <div className="bar">
                    <div style={{ width: `${procent}%`, background: scoreKleur(procent) }} />
                  </div>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{procent}%</strong>
                </div>
              )}
              {p.status === 'submitted' && p.totalMax > 0 && (
                <span className="badge badge-warn" title="Je leerkracht moet nog een deel verbeteren; je score kan nog veranderen">
                  ✍️ nog niet volledig verbeterd
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
