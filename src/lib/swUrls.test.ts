import { describe, expect, it } from 'vitest';
import { assetUrlsToWarm, serviceWorkerUrls } from './swUrls';

describe('serviceWorkerUrls', () => {
  it('GitHub Pages onder /Boosterz/', () => {
    expect(serviceWorkerUrls('https://thomasteamict.github.io/Boosterz/assets/index-abc123.js')).toEqual({
      script: 'https://thomasteamict.github.io/Boosterz/sw.js',
      scope: 'https://thomasteamict.github.io/Boosterz/',
    });
  });

  it('lokale preview op /', () => {
    expect(serviceWorkerUrls('http://localhost:4187/assets/index-abc123.js')).toEqual({
      script: 'http://localhost:4187/sw.js',
      scope: 'http://localhost:4187/',
    });
  });

  it('dieper subpad', () => {
    expect(serviceWorkerUrls('https://example.org/a/b/assets/index-x.js')?.scope).toBe('https://example.org/a/b/');
  });

  it('niets registreren als de bundel niet in assets/ staat of de URL vreemd is', () => {
    expect(serviceWorkerUrls('http://localhost:5173/src/main.tsx')).toBeNull();
    expect(serviceWorkerUrls('http://localhost:4187/assets/sub/index-x.js')).toBeNull();
    expect(serviceWorkerUrls('blob:http://localhost:4187/1234')).toBeNull();
    expect(serviceWorkerUrls('file:///tmp/assets/index-x.js')).toBeNull();
    expect(serviceWorkerUrls('geen url')).toBeNull();
  });
});

describe('assetUrlsToWarm', () => {
  const scope = 'https://thomasteamict.github.io/Boosterz/';
  it('alleen eigen bestanden in assets/, zonder dubbels of query', () => {
    const urls = assetUrlsToWarm(
      [
        scope + 'assets/index-a.js',
        scope + 'assets/seed-b.js',
        scope + 'assets/seed-b.js',
        scope + 'assets/quiz-c.js#x',
        scope + 'assets/x.js?v=2',
        scope + 'voorbeelden/nw/h01-01.jpg',
        'https://fonts.googleapis.com/css2?family=Outfit',
        'https://thomasteamict.github.io/Ander/assets/index-z.js',
        'https://thomasteamict.github.io/Boosterzzz/assets/index-z.js',
      ],
      scope
    );
    expect(urls).toEqual([scope + 'assets/index-a.js', scope + 'assets/seed-b.js', scope + 'assets/quiz-c.js']);
  });
});
