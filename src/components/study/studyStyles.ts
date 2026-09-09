// Opmaak van de leerstofmodule. Staat bewust niet in global.css: die wordt
// ook door het leerlingpad (/speel, /meedoen) geladen en hoeft niets van
// deze module te weten. De pagina's injecteren deze regels zelf.

export const STUDY_CSS = `
.study-head {
  display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;
  padding: 16px 20px; border-radius: var(--radius-l);
  background: var(--bg-raised); border: 1px solid var(--line); box-shadow: var(--shadow-1);
  border-left: 6px solid var(--study-accent, var(--brand));
  margin-bottom: 18px;
}
.study-head h1 { margin: 0 0 4px; font-size: 1.45rem; }
.study-head .meta { color: var(--text-soft); font-size: 0.92rem; margin: 0; }
.study-head-side { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.study-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; font-size: 0.82rem; font-weight: 700;
  background: var(--bg-sunken); color: var(--text-soft); border: 1px solid var(--line);
}
.study-chip-urgent { background: var(--err-soft); color: var(--err); border-color: transparent; }
.study-chip-dichtbij { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
.study-chip-ver { background: var(--brand-soft); color: var(--brand); border-color: transparent; }
.study-chip-voorbij { background: var(--bg-sunken); color: var(--text-faint); }
.study-chip-ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }

.study-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.study-card {
  display: flex; flex-direction: column; gap: 8px; padding: 15px 17px 16px;
  border-left: 5px solid var(--study-accent, var(--brand));
}
.study-card h3 { margin: 0; font-size: 1.06rem; }
.study-card .bron { color: var(--text-faint); font-size: 0.84rem; margin: 0; }
.study-card-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }

.study-meter { height: 9px; border-radius: 999px; background: var(--bg-sunken); overflow: hidden; }
.study-meter > div { height: 100%; border-radius: 999px; background: var(--ok); transition: width 0.4s ease; }

.study-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.study-tabs button {
  border: 0; background: transparent; cursor: pointer; font: inherit; font-weight: 650;
  color: var(--text-soft); padding: 9px 14px; border-radius: var(--radius-s) var(--radius-s) 0 0;
  border-bottom: 3px solid transparent; margin-bottom: -1px;
}
.study-tabs button:hover { background: var(--bg-sunken); color: var(--text); }
.study-tabs button[aria-selected='true'] { color: var(--brand); border-bottom-color: var(--brand); }

.study-section { padding: 18px 20px; margin-bottom: 14px; }
.study-section > h3 { margin-top: 0; }
.study-section p:last-child { margin-bottom: 0; }
.study-section ul, .study-section ol { padding-left: 22px; margin: 0 0 0.8em; }
.study-section code {
  font-family: 'Cascadia Code', Consolas, monospace; font-size: 0.94em;
  background: var(--bg-sunken); padding: 1px 5px; border-radius: 5px;
}

.study-figure { margin: 14px 0 0; padding: 12px; background: var(--bg-sunken); border-radius: var(--radius-m); }
.study-figure svg { display: block; max-width: 420px; margin: 0 auto; }
.study-figure figcaption { font-size: 0.82rem; color: var(--text-faint); margin-top: 8px; text-align: center; }

.study-notation { width: 100%; border-collapse: collapse; }
.study-notation th, .study-notation td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.study-notation th { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
.study-notation td:first-child { font-weight: 700; white-space: nowrap; font-family: 'Cascadia Code', Consolas, monospace; }

.study-pitfall {
  display: flex; gap: 10px; padding: 10px 13px; border-radius: var(--radius-m);
  background: var(--warn-soft); color: var(--text); margin-bottom: 8px;
}
.study-pitfall span:first-child { flex: none; }

.study-quiz-card { padding: 24px; text-align: center; }
.study-quiz-prompt { font-size: 1.25rem; font-weight: 650; margin: 6px 0 18px; white-space: pre-wrap; }
.study-quiz-answer {
  background: var(--ok-soft); border-radius: var(--radius-m); padding: 14px 16px; margin-bottom: 18px;
  text-align: left; white-space: pre-wrap;
}
.study-quiz-answer strong { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ok); margin-bottom: 4px; }

.study-photo-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.study-photo { padding: 8px; }
.study-photo img { width: 100%; border-radius: var(--radius-s); display: block; cursor: zoom-in; }
.study-photo figcaption { font-size: 0.82rem; color: var(--text-soft); padding: 6px 2px 0; }

.study-editor-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
.study-editor-row .input, .study-editor-row .textarea { flex: 1; }
.study-editor-block { border: 1px solid var(--line); border-radius: var(--radius-m); padding: 12px 14px; margin-bottom: 10px; background: var(--bg-raised); }

@media print {
  .topbar, .study-tabs, .study-head-side, .btn, .storage-bar, .study-card-actions { display: none !important; }
  .study-section, .study-head { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; }
  .study-figure { background: none; }
}
`;
