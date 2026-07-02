/** Korte unieke id. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Deelcode van 6 tekens, zonder verwarrende tekens (0/O, 1/I). */
export function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Tekst normaliseren voor antwoordvergelijking. */
export function normalizeAnswer(s: string, caseSensitive = false): string {
  let t = s.trim().replace(/\s+/g, ' ');
  if (!caseSensitive) t = t.toLocaleLowerCase('nl');
  // accenten negeren
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('nl-BE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function pct(earned: number, max: number): number {
  return max <= 0 ? 0 : Math.round((earned / max) * 100);
}

/** Bestand naar data-URL lezen (voor afbeeldingen in widgets). */
export function fileToDataUrl(file: File, maxDim = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Bestand kon niet gelezen worden'));
    reader.onload = () => {
      const url = String(reader.result);
      if (!file.type.startsWith('image/')) return resolve(url);
      // Afbeeldingen verkleinen zodat localStorage niet volloopt.
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) return resolve(url);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(url);
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

export function downloadFile(name: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV-veld veilig quoten. */
export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
