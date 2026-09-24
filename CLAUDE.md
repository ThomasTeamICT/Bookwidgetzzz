# Boosterz: afspraken voor Claude

Boosterz is een volledig client-side leerplatform: React 18 en TypeScript strict, Vite, hash router, opslag in localStorage en IndexedDB, geen server. De app draait op GitHub Pages en wordt uitgerold vanaf de branch `claude/bookwidgets-web-app-kvcfim`.

- Alle tekst in de app en alle rapportage aan de gebruiker in Vlaams Nederlands. Toegankelijkheid telt: labels, toetsenbord, contrast.
- Nooit API-sleutels of persoonsgegevens in de repo. De AI-functies gebruiken de eigen sleutel van de leerkracht, en de app blijft bruikbaar zonder sleutel.
- Sync tussen toestellen is nog een concept: zie `docs/KLASKANAAL.md` en `src/lib/sync/types.ts`.

## Kwaliteitspoort

```bash
npm run lint        # 0 fouten; waarschuwingen niet bijmaken
npm run typecheck
npx vitest run
npm run build       # bewaakt het bundelbudget
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort &   # in de cloud per beurt opnieuw starten
PW_CHROMIUM=/opt/pw-browsers/chromium node tests/smoke.mjs
```

De deploy-workflow draait lint, typecheck, unit tests en build. Een lintfout blokkeert de uitrol. De mappen `tests/` en `tools/` vallen buiten ESLint.

## Voorbeeldcursus natuurwetenschappen

- Bron: de pdf's van een leerkracht, niet in de repo. `tools/importeer-pdfs.mjs` haalt ze door de echte importpagina; `tools/build-voorbeeldcursus.py` voegt afbeeldingen, doelcodes, flitskaarten en oefeningen toe.
- Handgeschreven oefeningen staan in `tools/oefeningen/hNN.json`. Het formaat staat in `SCHEMA.md`, de controle in `valideer.py`. De `inhoudschrijver` schrijft ze, de `nakijker` kijkt ze na.

## Geheugen bijwerken

Het werkwijzeblok hieronder is ook de bron van `docs/werkwijze/installeer-werkwijze.sh`, dat de werkwijze in elke repo en elke cloudomgeving klaarzet. Pas je het blok of een agent in `.claude/agents/` aan, draai dan `node tools/maak-werkwijze-installer.mjs`. Een unittest bewaakt dat het script gelijk loopt.

<!-- werkwijze:start -->
## Werkwijze: modellen en agents

Afgesproken met de gebruiker in september 2026. Geldt voor elk project en vervangt de eerdere afspraak om alle agents op opus te laten draaien.

**Kernregel.** Het duurste model zet je in waar een fout duur is en moeilijk te zien. Het goedkoopste zet je in waar een test of script de fout toch vangt. Schrijven en controleren doen altijd twee verschillende agents.

| Taak | Agent | Model |
|---|---|---|
| Regie, ontwerp, integratie, eindcontrole en commits | de hoofdsessie | het sterkste niveau, opus of fable, gekozen met /model |
| Lesinhoud schrijven: oefeningen, uitleg, cursustekst | `inhoudschrijver` | opus |
| Lesinhoud nakijken tegen de brontekst | `nakijker` | sonnet |
| Bevindingen en twijfelgevallen beoordelen | `rechter` | opus |
| Afgebakende code met een duidelijke spec | `bouwer`, in een worktree bij parallel werk | sonnet |
| Moeilijke code: synchronisatie, versleuteling, opslag, migraties | `kernbouwer` | opus; fable voor het zwaarste ontwerp |
| Codereview vanuit één invalshoek | `reviewer` | sonnet |
| Mechanisch werk: lint, hernoemen, logs lezen, tellen | `klusjes` | haiku |
| Code doorzoeken | `Explore`, ingebouwd | standaard |
| Alles wat een script kan controleren | geen model | validator, typecheck, tests, rooktest |

**Zo werken we**

1. Kleine taken doet de hoofdsessie zelf, zonder agents: een fix, een tekstwijziging, een vraag.
2. Grote taken gaan in fasen: begrijpen, ontwerpen, bouwen, reviewen. Per fase draait één workflow of een handvol agents. Tussen de fasen beoordeelt de hoofdsessie de resultaten en rapporteert aan de gebruiker.
3. Eerst de automatische poorten. Een agent levert pas op als validator, typecheck en tests groen zijn. Een model controleert niet wat een script kan controleren.
4. Elke opdracht aan een agent staat op zichzelf: het doel, de bestanden, het schema of de spec, het validatiecommando en wat niet aangeraakt mag worden. Agents committen niet. De hoofdsessie integreert, controleert en commit.
5. Lesinhoud: de `inhoudschrijver` schrijft, de `nakijker` controleert, twijfelgevallen gaan naar de `rechter`, en de hoofdsessie past de bron aan.
6. Review: een `reviewer` per invalshoek zoekt, de `rechter` bevestigt of weerlegt. Alleen bevestigde bevindingen worden opgelost.
7. De grondige modus met veel agents is voor grote fasen: een nieuwe module, een volledige audit, een grote inhoudsronde. Niet voor kleine klussen.
8. Communicatie met de gebruiker in Vlaams Nederlands: eerst het resultaat, kort, en zonder vakjargon waar het kan.
<!-- werkwijze:end -->
