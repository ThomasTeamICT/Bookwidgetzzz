import { describe, expect, it } from 'vitest';
import { hasMarkdownFormatting } from './textFormatting';

describe('hasMarkdownFormatting', () => {
  it('is false voor lege tekst', () => {
    expect(hasMarkdownFormatting('')).toBe(false);
    expect(hasMarkdownFormatting('   \n  ')).toBe(false);
  });

  it('is false voor platte tekst zonder opmaak', () => {
    expect(hasMarkdownFormatting('Dit is gewoon een zin zonder opmaak.')).toBe(false);
    expect(hasMarkdownFormatting('Twee zinnen.\nOp twee regels, maar plat.')).toBe(false);
  });

  it('herkent een kop', () => {
    expect(hasMarkdownFormatting('## Een kop\n\nEn wat tekst.')).toBe(true);
  });

  it('herkent een ongeordende lijst', () => {
    expect(hasMarkdownFormatting('- eerste\n- tweede')).toBe(true);
  });

  it('herkent een geordende lijst', () => {
    expect(hasMarkdownFormatting('1. eerste\n2. tweede')).toBe(true);
  });

  it('herkent vet', () => {
    expect(hasMarkdownFormatting('Dit is **belangrijk**.')).toBe(true);
  });

  it('herkent een link', () => {
    expect(hasMarkdownFormatting('Zie [de bron](https://example.com).')).toBe(true);
  });

  it('herkent een afbeelding', () => {
    expect(hasMarkdownFormatting('![alt](https://example.com/x.png)')).toBe(true);
  });

  it('herkent een tabel', () => {
    expect(hasMarkdownFormatting('| a | b |\n| - | - |\n| 1 | 2 |')).toBe(true);
  });

  it('herkent een citaat', () => {
    expect(hasMarkdownFormatting('> een citaat')).toBe(true);
  });

  it('een los sterretje of streepje midden in een zin is geen lijst of vet', () => {
    expect(hasMarkdownFormatting('3 * 4 is twaalf - dat klopt.')).toBe(false);
  });
});
