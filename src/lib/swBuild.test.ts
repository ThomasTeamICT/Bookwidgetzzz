import { describe, expect, it } from 'vitest';
import { NEVER_PRECACHE, assetRefs, collectShell, knownFiles, renderServiceWorker, type BundleFile } from './swBuild';

// Een bundel zoals Vite ze bouwt, verkleind.
const bundle: BundleFile[] = [
  { fileName: 'assets/index-AAA.js', type: 'chunk', isEntry: true, imports: ['assets/vendor-VVV.js'], importedCss: ['assets/index-CSS.css'] },
  { fileName: 'assets/vendor-VVV.js', type: 'chunk', imports: [], importedCss: [] },
  { fileName: 'assets/Layout-LLL.js', type: 'chunk', imports: ['assets/index-AAA.js'], importedCss: ['assets/Layout-LCS.css'] },
  { fileName: 'assets/quiz-QQQ.js', type: 'chunk', imports: ['assets/index-AAA.js'] },
  { fileName: 'assets/pdf-PPP.js', type: 'chunk', imports: [] },
  { fileName: 'assets/mammothDocx-MMM.js', type: 'chunk', imports: [] },
  { fileName: 'assets/jsQR-JJJ.js', type: 'chunk', imports: [] },
  { fileName: 'assets/index-CSS.css', type: 'asset' },
  { fileName: 'assets/Layout-LCS.css', type: 'asset' },
  { fileName: 'assets/pdf.worker.min-WWW.mjs', type: 'asset' },
  { fileName: 'index.html', type: 'asset' },
];
const html =
  '<head><script type="module" crossorigin src="./assets/index-AAA.js"></script>' +
  '<link rel="modulepreload" crossorigin href="./assets/vendor-VVV.js">' +
  '<link rel="stylesheet" crossorigin href="./assets/index-CSS.css">' +
  '<link rel="manifest" href="./manifest.webmanifest"></head>';

describe('collectShell', () => {
  it('de hoofdbundel, haar statische imports en haar css; niets lazy', () => {
    const shell = collectShell(bundle, html);
    expect(shell.entry).toBe('assets/index-AAA.js');
    expect(shell.files).toEqual(['assets/index-AAA.js', 'assets/index-CSS.css', 'assets/vendor-VVV.js']);
  });

  it('geen pdf.js, mammoth, jsQR of lazy pagina in de voorcache', () => {
    const { files } = collectShell(bundle, html);
    expect(files.filter((f) => NEVER_PRECACHE.test(f))).toEqual([]);
    expect(files.some((f) => f.includes('Layout') || f.includes('quiz'))).toBe(false);
  });

  it('faalt luid zonder of met meer dan één hoofdbundel', () => {
    expect(() => collectShell(bundle.filter((f) => !f.isEntry), html)).toThrow(/precies één hoofdbundel/);
    expect(() =>
      collectShell([...bundle, { fileName: 'assets/tweede-XYZ.js', type: 'chunk', isEntry: true }], html)
    ).toThrow(/precies één hoofdbundel/);
  });

  it('faalt luid als index.html niet naar de hoofdbundel verwijst', () => {
    expect(() => collectShell(bundle, '<script src="./assets/ander-ZZZ.js"></script>')).toThrow(/verwijst niet naar de hoofdbundel/);
  });

  it('faalt luid als index.html naar een onbekend bestand verwijst', () => {
    expect(() => collectShell(bundle, html + '<link rel="stylesheet" href="./assets/weg-000.css">')).toThrow(/niet in de build/);
  });

  it('faalt luid als de hoofdbundel niet in assets/ staat', () => {
    const b = bundle.map((f) => (f.isEntry ? { ...f, fileName: 'main.js' } : f));
    expect(() => collectShell(b, '<script src="./main.js"></script>')).toThrow(/niet in assets/);
  });
});

describe('NEVER_PRECACHE', () => {
  it('vangt de zware bibliotheken, niet de gewone chunks', () => {
    for (const f of ['assets/pdf-aGDrFUlY.js', 'assets/pdf.worker.min-CLrFZWeq.mjs', 'assets/mammothDocx-Bg5sqDFm.js', 'assets/jsQR-DvD3PFUh.js']) {
      expect(NEVER_PRECACHE.test(f), f).toBe(true);
    }
    for (const f of ['assets/index-DWAcka4V.js', 'assets/PdfViewer-DCqhIeaU.js', 'assets/quiz-C1J3x4w3.js', 'manifest.webmanifest']) {
      expect(NEVER_PRECACHE.test(f), f).toBe(false);
    }
  });
});

describe('assetRefs', () => {
  it('leest script- en linkverwijzingen naar assets/, met of zonder ./', () => {
    expect(assetRefs(html)).toEqual(['assets/index-AAA.js', 'assets/vendor-VVV.js', 'assets/index-CSS.css']);
    expect(assetRefs("<script src='assets/a-1.js'></script><img src=\"voorbeelden/x.jpg\">")).toEqual(['assets/a-1.js']);
    expect(assetRefs('<p>geen verwijzingen</p>')).toEqual([]);
  });
});

describe('knownFiles', () => {
  it('bundel en openbare bestanden, zonder index.html en sw.js, met / als scheiding', () => {
    expect(knownFiles(['assets/b.js', 'index.html', 'sw.js', 'assets/a.js'], ['voorbeelden\\nw\\h01.jpg', 'icon.svg'])).toEqual([
      'assets/a.js',
      'assets/b.js',
      'icon.svg',
      'voorbeelden/nw/h01.jpg',
    ]);
  });
});

describe('renderServiceWorker', () => {
  const template = '/* sjabloon */ const x = BOOSTERZ.version;';
  const config = { version: 'abc123def456', entry: 'assets/index-AAA.js', precache: ['assets/index-AAA.js'], known: ['assets/index-AAA.js'] };

  it('zet de configuratie vóór het sjabloon', () => {
    const out = renderServiceWorker(template, config);
    expect(out).toContain(`const BOOSTERZ = ${JSON.stringify(config)};`);
    expect(out).toContain('Versie abc123def456');
    expect(out.endsWith(template)).toBe(true);
  });

  it('weigert een ongeldige versie, een ontbrekende hoofdbundel of een vreemd sjabloon', () => {
    expect(() => renderServiceWorker(template, { ...config, version: '' })).toThrow(/versie/);
    expect(() => renderServiceWorker(template, { ...config, version: 'a b"c' })).toThrow(/versie/);
    expect(() => renderServiceWorker(template, { ...config, precache: [] })).toThrow(/hoofdbundel/);
    expect(() => renderServiceWorker('console.log(1)', config)).toThrow(/sjabloon/);
  });
});
