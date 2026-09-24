// Bewaakt het projectgeheugen: de agentdefinities in .claude/agents/, de
// werkwijzetabel in CLAUDE.md en het installatiescript in docs/werkwijze/
// moeten met elkaar kloppen. Zie het blok "Werkwijze: modellen en agents".
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const agentsDir = path.join(root, '.claude', 'agents');
const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  return Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}

const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort();
const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
const block = /<!-- werkwijze:start -->[\s\S]*?<!-- werkwijze:end -->/.exec(claude)?.[0] ?? '';

describe('werkwijze: agents en geheugen', () => {
  it('CLAUDE.md bevat het werkwijzeblok', () => {
    expect(block).toContain('## Werkwijze: modellen en agents');
  });

  it.each(agentFiles)('%s heeft geldige frontmatter', (file) => {
    const fm = frontmatter(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
    expect(fm.name).toBe(file.replace(/\.md$/, ''));
    expect(MODELS).toContain(fm.model);
    expect((fm.description ?? '').length).toBeGreaterThan(40);
  });

  it('elke agent in de werkwijzetabel bestaat, en elke agent staat in de tabel', () => {
    const inTable = [...block.matchAll(/^\| [^|]+\| `([a-z]+)`/gm)].map((m) => m[1]).sort();
    const defined = agentFiles.map((f) => f.replace(/\.md$/, ''));
    expect(inTable).toEqual(defined);
  });

  it('het model in de tabel is het model uit de agentdefinitie', () => {
    for (const file of agentFiles) {
      const fm = frontmatter(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
      const row = new RegExp(`^\\| [^|]+\\| \`${fm.name}\`[^|]*\\| ([a-z]+)`, 'm').exec(block);
      expect(row?.[1], fm.name).toBe(fm.model);
    }
  });

  it('docs/werkwijze/installeer-werkwijze.sh is bij met CLAUDE.md en .claude/agents/', () => {
    expect(() => execFileSync('node', ['tools/maak-werkwijze-installer.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  });
});
