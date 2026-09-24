import { describe, expect, it } from 'vitest';
import { absolutizeExampleUrls } from './examples';
import { createCourse } from './courses';

describe('absolutizeExampleUrls', () => {
  it('zet relatieve voorbeeld-URL\'s om naar de app-basis en laat andere URL\'s met rust', () => {
    const c = createCourse('x');
    c.chapters = [{ id: 'c', title: 'H', sections: [{ id: 's', title: 'S', blocks: [
      { id: '1', type: 'image', url: 'voorbeelden/nw/h01-01.jpg', size: 'normal' },
      { id: '2', type: 'image', url: 'https://example.org/a.png', size: 'normal' },
      { id: '3', type: 'text', markdown: 'voorbeelden/nw/niet-aanraken' },
    ] }] }];
    absolutizeExampleUrls(c, '/Boosterz/');
    const blocks = c.chapters[0].sections[0].blocks;
    expect(blocks[0].type === 'image' && blocks[0].url).toBe('/Boosterz/voorbeelden/nw/h01-01.jpg');
    expect(blocks[1].type === 'image' && blocks[1].url).toBe('https://example.org/a.png');
    expect(blocks[2].type === 'text' && blocks[2].markdown).toBe('voorbeelden/nw/niet-aanraken');
  });

  it('werkt ook met een basis zonder slash op het einde', () => {
    const c = createCourse('x');
    c.chapters = [{ id: 'c', title: 'H', sections: [{ id: 's', title: 'S', blocks: [{ id: '1', type: 'image', url: 'voorbeelden/nw/a.jpg', size: 'small' }] }] }];
    absolutizeExampleUrls(c, '/app');
    const b = c.chapters[0].sections[0].blocks[0];
    expect(b.type === 'image' && b.url).toBe('/app/voorbeelden/nw/a.jpg');
  });
});
