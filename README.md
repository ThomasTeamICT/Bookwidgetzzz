# 🧩 WidgetFabriek

Een volledig functionele webapplicatie om **interactieve oefeningen, toetsen, spelletjes én digitale cursussen** voor je klas te maken, te delen en op te volgen — geïnspireerd op het concept van digitale les-widgets. Alles draait 100% in de browser: geen server, geen account, geen installatie.

## ✨ Functies

### ✨ AI-assistent: van bronmateriaal naar lesmateriaal
Hét verkoopsargument: de leerkracht plakt gangbaar bronmateriaal (cursustekst, hoofdstuk,
artikel) of leerplandoelen en de AI doet het voorbereidende werk — met minimale inspanning
en maximale opvolgbaarheid.
- **AI-studio** (`#/ai-studio`): bron plakken of .txt/.md laden → widgettypes kiezen (20
  genereerbare types) → voorvertoning met vraag-linter → nakijken → in één keer bewaren in
  een map. Met doelgroep, richtaantal, leerdoelkoppeling en **differentiatie** (hints,
  steuntaal, niveaus) als opties.
- **AI in de editor**: vragen bijmaken, hints/uitleg/steuntaal aanvullen, glossarium
  destilleren, zwakke afleiders versterken, items bijmaken bij 20 widgettypes — en bij de
  **video-quiz**: plak het transcript (bv. van YouTube) en krijg kijkvragen op de juiste
  tijdstippen.
- **AI-cursusbouwer**: een volledige cursus genereren **vanuit leerplandoelen** (of een
  bestaande cursus herwerken / een sectie vullen), optioneel met een oefenquiz per hoofdstuk.
- **Feedbacksuggesties** bij het nakijken: taakgericht voorstel (wat lukt, wat nog niet,
  volgende stap) — zonder leerlingnaam in de prompt; de leerkracht past aan en beslist.
- **Eigen sleutel, eigen regie**: werkt met een API-sleutel van Anthropic (Claude), OpenAI
  of elke OpenAI-compatibele aanbieder. Sleutel blijft op het toestel; elk gebruik staat in
  een tokenlogboek (kostentransparantie). AI-uitvoer landt áltijd eerst in een voorvertoning.

### 📚 Cursusmodule: digitale cursussen (BrightBook-achtig, en verder)
- **Authoring**: hoofdstukken → secties → 16 bloktypes (kop, tekst met markdown,
  afbeelding, video, audio, extern kader, kadertjes, citaat, tabel, kolommen, uitklapper,
  begrippenlijst, afvinklijst, bijlage, scheiding, **ingebedde widget**).
- **Ingebedde oefeningen**: elke widget speelt inline in de cursus; inzendingen lopen
  gewoon door de resultaten- en leerdoelenanalyse.
- **Leerdoelen per sectie** en keuzesecties (verdieping, telt niet mee voor "afgewerkt"),
  met een **doelendekking-matrix** in de editor (welke leerplandoelen zijn gedekt, welke
  secties dragen nog geen doel).
- **Delen per hoofdstuk** via draagbare link (ingebedde widgets reizen mee; hoofdstukken
  voegen bij de leerling samen), klascode, QR, **insluitcode voor Smartschool/Moodle**,
  of cursusbestand voor collega's. Printbare versie inbegrepen.
- **Voor de leerling**: zoeken in de cursus, privénotities per sectie (lokaal,
  exporteerbaar, nooit in de voortgangscode) en het toegankelijkheidsmenu.
- **Voortgang volgen**: matrix leerlingen × secties (gelezen/geopend), kijktijd als
  context, per-sectieoverzicht ("waar haakt de klas af?"), widgetresultaten, CSV-export
  en **voortgangscodes** voor thuiswerk — transparant: de leerling ziet wat jij ziet.

### 38 widgettypes, in 5 categorieën

| Categorie | Widgets |
|---|---|
| 📝 **Toetsen & opdrachten** | Quiz · Werkblad · Gesplitst werkblad (bron naast vragen) · Video-quiz (video pauzeert op vragen) · Gesplitst whiteboard · Exit-ticket · Dictee (spraakstem) · Peiling |
| 🎮 **Spelletjes** | Flitskaarten · Kruiswoordraadsel · Woordzoeker · Memory · Galgje · Koppelspel · Husselwoorden · Bingo · Legpuzzel · Zoek de verschillen |
| 🖼️ **Beeld & media** | Tijdlijn · Hotspot-afbeelding · Whiteboard · Fotocarrousel · Afbeeldingsviewer (pan/zoom) · Voor/na-vergelijker · Framesequentie · Tip-tegels · Willekeurige afbeeldingen · Videospeler (YouTube/Vimeo) |
| 🧮 **Rekenen & wiskunde** | Rekenoefening (sommen & maaltafels) · Actieve plot (functiegrafieken met parameter-schuivers, eigen veilige formule-parser) · Grafiek (staaf/lijn/taart, leerlingen kunnen data aanpassen) |
| 🧑‍🏫 **Klashulpjes & projecten** | Rad van fortuin · Klastimer · Checklist · Planner · WebQuest · Mindmap (bekijken of zelf bouwen) · Piano (WebAudio) |

### De quiz ondersteunt 11 vraagtypes
Meerkeuze · meerdere antwoorden · juist/onjuist · kort antwoord · open vraag (manueel beoordeeld, met **rubrics**) · invuloefening met gaten `[zo|alternatief]` · koppelparen · rangschikken · getal met tolerantie · schuiver · infoblok. Per vraag: afbeelding, punten, uitleg bij feedback, **hint**, **leerdoel-tag** en **niveau** (voor routes), plus een **voorleesknop** (TTS, instelbaar tempo). Extra: **zekerheidsgraad** met kalibratiefeedback, **getrapte feedback** (controleren per vraag: fout → hint + tweede kans → oplossing), **niveauroutes** (leerling kiest route 1/2/3), **vragenpool**, **oefen-je-fouten**-ronde, **foutenanalyse door de leerling**, score **per leerdoel**, vraagbank-import en bulk-import via geplakte tekst. De editor bevat een **vraag-linter** die bekende constructiefouten signaleert; resultaten tonen **distractor-analyse** en een **doel-heatmap**, en open vragen kijk je na in een **nakijkcockpit** met herbruikbare feedbackbank. Nieuw materiaal start je vanuit een **sjabloonbibliotheek** (3-2-1 exit-ticket, diagnostische instap, herhaalquiz met pool, …).

### Voor de leerkracht
- **Dashboard** met mappen (kleuren), zoeken, dupliceren, omzetten (quiz ↔ werkblad ↔ exit-ticket), verwijderen
- **Editor** met live voorbeeldmodus ("Uitproberen"), automatisch opslaan en per-widget instellingen:
  accentkleur, instructies, schudden, feedback/score tonen, **tijdslimiet**, **maximum aantal pogingen**, naamverplichting, **toetsmodus** (volledig scherm + registratie venster-verlaten, transparant voor de leerling) en **deadline**
- **Resultaten**: scoreoverzicht per leerling, per-vraagstatistieken, live "nu bezig"-overzicht (zelfde toestel), detail per inzending met zekerheid/hintgebruik, **manuele beoordeling** met **rubrics**, feedback voor de leerling, **CSV-export** (ook anoniem voor teamoverleg)
- **Afdrukken/PDF** van quiz-familie, blanco of met correctiesleutel
- **Delen**: klascode (6 tekens) · **draagbare link** (widget zit gecomprimeerd in de URL, werkt op elk toestel) · **QR-code** · Google Classroom-knop · e-mail · **embed-code** (iframe) · JSON-bestand voor collega's
- **Resultaatcode**: leerlingen die thuis via de draagbare link werkten, sturen hun inzending als gecomprimeerde code terug — plakken bij de resultaten en klaar

### Voor de leerling
- Startscherm met naam ("voornaam volstaat"), instructies, tijdsindicatie en een kindvriendelijke privacy-uitleg
- **Opslaan & hervatten**: tussentijds werk blijft bewaard bij herladen of stroomonderbreking; "opnieuw beginnen" op gedeelde toestellen
- Voortgangsbalk, aftellende timer, automatisch indienen als de tijd om is
- Directe feedback met juiste antwoorden en uitleg; **oefen-je-fouten**-ronde; kalibratiefeedback bij zekerheidsgraad
- **Toegankelijkheidsmenu**: tekstgrootte, ruimere letterafstand en rustmodus (minder beweging) — per toestel onthouden

### Hulp & onboarding
Een ingebouwde **"Aan de slag"-pagina** (menu → Hulp) met de drie kernflows en veelgestelde
vragen (gegevens, AI-kosten, thuiswerk-codes, delen met collega's, LMS-insluiting, back-ups).

### UX & toegankelijkheid
- Modern, rustig ontwerp met **licht/donker/automatisch thema**
- Volledig **toetsenbordbedienbaar** (focusstijlen, focus-trap in modals, pijltjesnavigatie in het kruiswoordraadsel, spatie om flitskaarten te draaien)
- ARIA-rollen en live-regions voor schermlezers, `prefers-reduced-motion` wordt gerespecteerd
- **Voorleesknop** (TTS) per vraag en accenttekens-balk voor taalvakken
- Responsief tot op smartphoneformaat; speelvlakken scrollen horizontaal waar nodig

### Didactische onderbouwing
Zie [`DIDACTIEK.md`](./DIDACTIEK.md): welke features didactisch onderbouwd toegevoegd zijn
(formatieve evaluatie, UDL, zelfregulatie, werkdruk, AVG), de roadmap, én wat bewust
**niet** gebouwd is (leaderboards, zware proctoring, streaks/XP).

### Privacy (AVG)
Alles staat lokaal in de browser; de app heeft een eigen **privacypagina** met uitleg in
mensentaal, opschoonknoppen (inzendingen wissen, alles wissen) en een printbare one-pager
voor directie of ouders. CSV kan ook **zonder namen** geëxporteerd worden.

## 🚀 Starten

```bash
npm install
npm run dev        # ontwikkelserver op http://localhost:5173
npm run build      # productie-build in dist/
npm run preview    # productie-build lokaal bekijken
```

**Rooktest** (Playwright, ±100 checks over alle flows incl. foutpaden):

```bash
npm run build && npx vite preview --port 4173 &
node tests/smoke.mjs        # evt. PW_CHROMIUM=/pad/naar/chromium
```

De app is **code-gesplitst**: de hoofdbundel (±95 kB gzip) bevat alleen de leerlingroutes;
widgetmodules en leerkracht-pagina's laden als aparte chunks wanneer ze nodig zijn.
Een mislukte chunk-load (bv. door een nieuwe deploy) herstelt zichzelf met één automatische
herlaadbeurt.

De app gebruikt een **hash-router** en een relatieve basis-URL, dus de `dist/`-map kan op eender welke statische hosting geplaatst worden (GitHub Pages, Netlify, schoolserver, …) — ook in een submap.

## 🗂️ Architectuur

```
src/
  lib/            types, localStorage-laag, deellinks (lz-string), beoordeling, seed,
                  ai (providerlaag + streaming), aiWidgetGen (schema's + sanering),
                  aiCourse (cursusgeneratie), courseTypes + courses (cursusmodel/opslag/delen),
                  markdown (veilige mini-markdown)
  components/     ontwerpsysteem-componenten (modals, toasts, velden, score-ring),
                  aiCommon, AIEditorPanel, course/ (BlockRenderer, deel- en AI-modals)
  widgets/        registry + per widgettype één module met Editor & Player
  pages/          landing, dashboard, nieuw, editor, speler, meedoen, resultaten,
                  AI-studio, AI-instellingen, cursussen (overzicht/editor/viewer/volgen/print)
  styles/         global.css — volledig eigen ontwerpsysteem met CSS-variabelen
```

Elk widgettype registreert zich in `src/widgets/registry.tsx` met metadata, standaardconfiguratie, een **Editor**-component (leerkracht) en een **Player**-component (leerling). Een nieuw widgettype toevoegen = één module schrijven + één registratie.

### Gegevensopslag
Alles staat in `localStorage` (`wf.*`-sleutels): widgets, mappen, inzendingen, pogingen, cursussen, leesvoortgang, AI-instellingen en voorkeuren. Afbeeldingen worden bij het uploaden verkleind en als data-URL opgeslagen. Bij het eerste bezoek worden voorbeeldwidgets en een voorbeeldcursus geplaatst zodat je meteen kan verkennen.

### Beperkingen (bewust, door de serverloze opzet)
- Inzendingen en leesvoortgang komen alleen bij de leerkracht terecht als leerling en leerkracht **dezelfde browseropslag** delen (klascode-scenario) — bij de draagbare link blijven resultaten op het toestel van de leerling. Daarvoor zijn er **resultaatcodes** en **voortgangscodes**.
- "Live" meekijken tijdens het maken is er niet; resultaten verschijnen na het indienen.
- De AI-functies vragen een internetverbinding en een eigen API-sleutel; zonder sleutel blijft de app volledig offline werken.

## ✅ Kwaliteitscontrole
- `npm run build` — TypeScript strict + Vite-build zonder waarschuwingen
- Playwright-rooktest (37 checks) over de volledige flow: landing → dashboard → editor → voorbeeldmodus → leerlingflow via code → resultaten & beoordeling → kruiswoord/woordzoeker/memory/rad/rekenen → nieuwe widget maken → draagbare deellink → joinpagina → donker thema. Zonder console-fouten.
