// Maakt docs/werkwijze/installeer-werkwijze.sh uit het werkwijzeblok in
// CLAUDE.md en de agentdefinities in .claude/agents/.
//
//   node tools/maak-werkwijze-installer.mjs          # schrijft het script
//   node tools/maak-werkwijze-installer.mjs --check  # faalt als het script achterloopt
//
// Het script zet de werkwijze in ~/.claude, zodat ze in elke repo geldt: als
// setup-script van een cloudomgeving, of lokaal op de eigen computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'werkwijze', 'installeer-werkwijze.sh');
const EOF_MARK = 'BOOSTERZ_WERKWIJZE_EOF';

export function buildInstaller() {
  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  const block = /<!-- werkwijze:start -->[\s\S]*?<!-- werkwijze:end -->/.exec(claude)?.[0];
  if (!block) throw new Error('Werkwijzeblok niet gevonden in CLAUDE.md');
  const agentsDir = path.join(root, '.claude', 'agents');
  const agents = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => ({ name: f, body: fs.readFileSync(path.join(agentsDir, f), 'utf8').replace(/\n+$/, '') }));
  for (const text of [block, ...agents.map((a) => a.body)]) {
    if (text.includes(EOF_MARK)) throw new Error(`De tekst bevat de heredoc-markering ${EOF_MARK}`);
  }

  const lines = [
    '#!/usr/bin/env bash',
    '# Installeert de werkwijze "modellen en agents" in ~/.claude, zodat ze in elke repo geldt.',
    '# Gegenereerd door tools/maak-werkwijze-installer.mjs uit CLAUDE.md en .claude/agents/.',
    '# Niet met de hand aanpassen: pas de bron aan en genereer opnieuw.',
    '#',
    '# Cloud: plak dit script als setup-script van de omgeving (omgevingsmenu in de titelbalk',
    '#   van een sessie, Bewerken, Setup script). Elke nieuwe sessie in die omgeving krijgt het.',
    '# Lokaal: bash docs/werkwijze/installeer-werkwijze.sh',
    '#',
    '# Veilig om opnieuw te draaien: een eerdere versie van het werkwijzeblok in CLAUDE.md wordt',
    '# vervangen en de rest van dat bestand blijft staan. De agentbestanden worden overschreven.',
    'set -euo pipefail',
    'DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"',
    'mkdir -p "$DIR/agents"',
    'FILE="$DIR/CLAUDE.md"',
    'touch "$FILE"',
    'TMP="$(mktemp)"',
    '# Het oude blok en lege regels op het einde weghalen.',
    'awk \'/<!-- werkwijze:start -->/{skip=1} !skip{lines[++n]=$0} /<!-- werkwijze:end -->/{skip=0} END{while (n > 0 && lines[n] == "") n--; for (i = 1; i <= n; i++) print lines[i]}\' "$FILE" > "$TMP"',
    'if [ -s "$TMP" ]; then printf \'\\n\' >> "$TMP"; fi',
    `cat >> "$TMP" <<'${EOF_MARK}'`,
    block,
    EOF_MARK,
    'cat "$TMP" > "$FILE"',
    'rm -f "$TMP"',
  ];
  for (const a of agents) {
    lines.push(`cat > "$DIR/agents/${a.name}" <<'${EOF_MARK}'`, a.body, EOF_MARK);
  }
  lines.push(`echo "Werkwijze geïnstalleerd in $DIR: CLAUDE.md en ${agents.length} agents."`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const script = buildInstaller();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== script) {
      console.error('docs/werkwijze/installeer-werkwijze.sh loopt achter. Draai: node tools/maak-werkwijze-installer.mjs');
      process.exit(1);
    }
    console.log('installeer-werkwijze.sh is bij.');
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, script, { mode: 0o755 });
    console.log(`Geschreven: ${path.relative(root, out)}`);
  }
}
