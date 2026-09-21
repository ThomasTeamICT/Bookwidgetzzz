# Handgeschreven oefeningen voor de voorbeeldcursus

Eén json per hoofdstuk: `h01.json` … `h13.json` (`h10a.json`, `h10b.json`). Het bouwscript
(`tools/build-voorbeeldcursus.py`) zet ze om in echte widgets en hangt ze als widgetblok in de
juiste sectie. Alles is Nederlands (Vlaams), niveau 1e graad A-stroom (12–13 jaar), en volgt
de tekst van het hoofdstuk: geen kennis van buitenaf, geen strikvragen.

```json
{
  "hoofdstuk": "05",
  "oefeningen": [
    {
      "sectie": "3.1",
      "plaats": "einde",
      "type": "quiz",
      "titel": "Check: de weg van het voedsel",
      "toelichting": "Vier korte vragen over de route van mond tot kont.",
      "config": { "questions": [ … ] }
    }
  ]
}
```

- `sectie`: het begin van de sectietitel: het nummer (`"3.1"`, `"2."`) of een woord
  (`"Inleiding"`, `"Mindmap"`, `"Kernbegrippen"`, `"Oefeningen"`). Moet bestaan in het hoofdstuk
  (zie `secties.json`).
- `plaats`: `"einde"` (standaard) of `"begin"` van de sectie.
- `type`: `quiz` | `exitticket` | `worksheet` | `pairs` | `memory` | `scramble` | `hangman` |
  `wordsearch` | `crossword` | `poll` | `checklist`.
- `titel`: kort, voor de leerling. `toelichting`: één zin die boven de oefening in de cursus staat.
- `config`: zie hieronder. **Geen id's schrijven** (het bouwscript maakt ze), geen `points`
  tenzij afwijkend (standaard 1; open vraag 2).

## Vraagtypes (quiz, exitticket, worksheet → `config.questions`)

| type | velden |
|---|---|
| `mc` | `prompt`, `options` (4, uniek), `correctIndex`, `explanation` |
| `multi` | `prompt`, `options` (4–5), `correctIndices` (≥ 2), `explanation` |
| `tf` | `prompt` (een stelling), `answer` (true/false), `explanation` |
| `short` | `prompt`, `accepted` (alle juiste schrijfwijzen, kleine letters), `explanation` |
| `long` | `prompt`, `modelAnswer`, optioneel `rubric: [{criterion, points}]` (som = 2) |
| `gap` | `prompt` (instructie), `text` met het antwoord tussen `[haken]`, 1–3 gaten |
| `match` | `prompt`, `pairs: [{left, right}]` (4–6) |
| `order` | `prompt`, `items` in de **juiste** volgorde (4–7) |
| `number` | `prompt`, `answer`, `tolerance`, `explanation` |
| `dropdown` | `prompt`, `text` met per gat `{juist|fout|fout}` (eerste is juist), `shuffle: true` |
| `marktext` | `prompt`, `text` met de aan te klikken woorden tussen `[haken]`, `penalizeWrong: false` |
| `sort` | `prompt`, `categories: ["…", "…"]`, `items: [{text, category}]` (category = naam) |
| `table` | `prompt`, `columns`, `rows: [{cells: ["…", ""], answers: [null, "antwoord"]}]` |
| `info` | `prompt` (markdown, leerstof of instructie tussen vragen) |

Elke vraag mag `hint` (één zin op weg helpen) en `explanation` (waarom dit juist is) hebben.
`quiz` toont vraag per vraag met tweede kans; `worksheet` alles onder elkaar (wissel af met
`info`); `exitticket` is 3 à 4 vragen die de kern van het hoofdstuk checken.

## Andere widgets (`config`)

- `pairs`: `{ "pairs": [{ "left", "right" }] }` 4–8 paren (koppelen).
- `memory`: `{ "pairs": [{ "a", "b" }] }` 6–8 paren, korte kaartjes (≤ 40 tekens).
- `scramble`: `{ "mode": "word" | "sentence", "items": [{ "text", "hint" }] }` 5–8 items.
- `hangman`: `{ "words": [{ "word", "hint" }] }` 5–8 woorden zonder spaties.
- `wordsearch`: `{ "words": ["…"] }` 8–12 woorden zonder spaties, max 12 letters.
- `crossword`: `{ "entries": [{ "word", "clue" }] }` 6–10 woorden zonder spaties.
- `poll`: `{ "question", "options", "allowMultiple": false }` (mening, geen juist/fout).
- `checklist`: `{ "title", "items": ["…"] }` (bv. stappen van een proef).

## Wat een goed hoofdstuk bevat

- 1 exit-ticket (3–4 vragen) in de sectie `Oefeningen`.
- Per 2 à 3 theoriesecties 1 quiz (4–6 vragen, **gemengde types**) aan het einde van de
  belangrijkste sectie ervan, met een `order`, `sort`, `table`, `dropdown` of `marktext` waar de
  stof dat vraagt (een route → `order`, een indeling → `sort`, een vergelijking → `table`).
- 1 werkblad met 3 à 5 open of half-open vragen die de leerling laat toepassen (`long` met
  `modelAnswer` en `rubric`, `gap`, `number` bij berekeningen).
- 1 à 2 spelvormen (`memory`, `scramble`, `hangman`, `wordsearch`, `crossword`) bij
  `Kernbegrippen` of `Oefeningen`.
- Niet dubbelen wat er al automatisch is: de begrippenquiz (term ↔ omschrijving), het koppelspel
  met de begrippen en de invuloefeningen uit de vette begrippen bestaan al. Flitskaarten ook.

Valideren: `python3 tools/oefeningen/valideer.py tools/oefeningen/h05.json <secties.json>`.
