import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * QR-scanner met de camera van het toestel — voor het inleverpunt: de
 * leerkracht scant de codes van de rij leerlingen aan zijn bureau.
 *
 * Twee wegen naar hetzelfde resultaat:
 *  1. `BarcodeDetector`, als de browser die heeft (Chrome/Edge op Android en
 *     ChromeOS): native, snel en zuinig voor de batterij;
 *  2. anders `jsqr` op canvasframes — lui geladen, want dat is ~50 kB die
 *     niemand nodig heeft die nooit scant.
 *
 * Doorlopend scannen: de camera blijft aan tot je stopt. Dezelfde code wordt
 * niet twee keer doorgegeven (leerlingen blijven hun scherm nu eenmaal even
 * voorhouden), elke nieuwe scan geeft een kort trilsignaal en toontje, en de
 * log eronder is een aria-live-gebied zodat ook een schermlezer meevolgt.
 */

/** Minimale vorm van de native BarcodeDetector (staat niet in de TS-lib). */
interface BarcodeLike { rawValue?: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeLike[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

/** Kort trilsignaal + toontje: bevestiging zonder naar het scherm te kijken. */
function feedback() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // genegeerd: trillen is een extraatje
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => { void ctx.close().catch(() => { /* genegeerd */ }); };
  } catch {
    // genegeerd: geluid is een extraatje (en mag geblokkeerd zijn)
  }
}

export function QrScanner({
  onCode,
  onClose,
  hint,
}: {
  /** Wordt aangeroepen per nieuwe code; geef een regel terug voor de log. */
  onCode: (text: string) => string | void;
  onClose: () => void;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [count, setCount] = useState(0);

  const handleText = useCallback((text: string) => {
    const value = text.trim();
    if (!value || seenRef.current.has(value)) return;
    seenRef.current.add(value);
    feedback();
    const message = onCodeRef.current(value) || 'Code gescand';
    setCount((c) => c + 1);
    setLog((l) => [{ id: Date.now() + Math.random(), text: message }, ...l].slice(0, 12));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let busy = false;

    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext === false
            ? 'De camera werkt alleen op een beveiligde verbinding (https). Plak de codes hieronder gewoon als tekst.'
            : 'Deze browser geeft geen toegang tot de camera. Plak de codes hieronder gewoon als tekst.'
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Je gaf (nog) geen toestemming voor de camera. Geef ze in de adresbalk van je browser, of plak de codes hieronder als tekst.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Er is geen camera gevonden op dit toestel. Plak de codes hieronder gewoon als tekst.'
              : 'De camera kon niet gestart worden. Plak de codes hieronder gewoon als tekst.'
        );
        return;
      }
      if (cancelled) {
        stop();
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // genegeerd: sommige browsers spelen pas na een extra tik
      }
      if (cancelled) {
        stop();
        return;
      }
      setReady(true);

      const detector = (() => {
        const Ctor = barcodeDetectorCtor();
        try {
          return Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
        } catch {
          return null;
        }
      })();

      let jsQR: typeof import('jsqr').default | null = null;
      if (!detector) {
        try {
          jsQR = (await import('jsqr')).default;
        } catch {
          setError('De scanner kon niet geladen worden. Plak de codes hieronder gewoon als tekst.');
          stop();
          return;
        }
      }

      const tick = async () => {
        if (busy || cancelled) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !v.videoWidth) return;
        busy = true;
        try {
          if (detector) {
            const found = await detector.detect(v);
            for (const b of found) if (b.rawValue) handleText(b.rawValue);
          } else if (jsQR) {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d', { willReadFrequently: true });
            if (canvas && ctx) {
              // Op een kleiner frame scannen kost merkbaar minder rekenwerk en
              // volstaat ruim voor een QR die iemand voorhoudt.
              const scale = Math.min(1, 640 / v.videoWidth);
              canvas.width = Math.round(v.videoWidth * scale);
              canvas.height = Math.round(v.videoHeight * scale);
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const res = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
              if (res?.data) handleText(res.data);
            }
          }
        } catch {
          // genegeerd: één mislukt frame is geen fout, de volgende komt zo
        } finally {
          busy = false;
        }
      };

      timer = window.setInterval(() => { void tick(); }, 220);
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [handleText]);

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <strong style={{ flex: 1 }}>📷 Scannen met de camera</strong>
        <span className="badge badge-brand" aria-hidden>{count} gescand</span>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>⏹ Stoppen</button>
      </div>

      {error ? (
        <div className="callout warn" role="alert">
          <span aria-hidden>📷</span>
          <div>{error}</div>
        </div>
      ) : (
        <>
          <div
            style={{
              position: 'relative', maxWidth: 420, margin: '0 auto',
              borderRadius: 'var(--radius-m)', overflow: 'hidden', background: '#000',
            }}
          >
            {/* muted: geen audio nodig, en zo start de camera ook op iOS */}
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', display: 'block', maxHeight: '48vh', objectFit: 'cover' }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: '14%', border: '3px solid rgba(255,255,255,0.85)',
                borderRadius: 14, pointerEvents: 'none',
              }}
            />
          </div>
          <canvas ref={canvasRef} hidden />
          <p className="hint" style={{ textAlign: 'center', marginTop: 8 }} role="status">
            {ready
              ? (hint ?? 'Houd de QR-code van de leerling in het kader. De scanner blijft aan tot je stopt.')
              : 'Camera wordt gestart…'}
          </p>
        </>
      )}

      <div aria-live="polite" aria-label="Gescande codes" style={{ marginTop: 10 }}>
        {log.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Nog niets gescand.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {log.map((l) => (
              <li key={l.id} style={{ fontSize: '0.9rem' }}>✓ {l.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
