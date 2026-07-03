# 🧩 WidgetFabriek

Een volledig functionele webapplicatie om **interactieve oefeningen, toetsen en spelletjes** voor je klas te maken, te delen en op te volgen — geïnspireerd op het concept van digitale les-widgets. Alles draait 100% in de browser: geen server, geen account, geen installatie.

## ✨ Functies

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

De app gebruikt een **hash-router** en een relatieve basis-URL, dus de `dist/`-map kan op eender welke statische hosting geplaatst worden (GitHub Pages, Netlify, schoolserver, …) — ook in een submap.

## 🗂️ Architectuur

```
src/
  lib/            types, localStorage-laag, deellinks (lz-string), beoordeling, seed
  components/     ontwerpsysteem-componenten (modals, toasts, velden, score-ring)
  widgets/        registry + per widgettype één module met Editor & Player
  pages/          landing, dashboard, nieuw, editor, speler, meedoen, resultaten
  styles/         global.css — volledig eigen ontwerpsysteem met CSS-variabelen
```

Elk widgettype registreert zich in `src/widgets/registry.tsx` met metadata, standaardconfiguratie, een **Editor**-component (leerkracht) en een **Player**-component (leerling). Een nieuw widgettype toevoegen = één module schrijven + één registratie.

### Gegevensopslag
Alles staat in `localStorage` (`wf.*`-sleutels): widgets, mappen, inzendingen, pogingen en voorkeuren. Afbeeldingen worden bij het uploaden verkleind en als data-URL opgeslagen. Bij het eerste bezoek worden 8 voorbeeldwidgets geplaatst zodat je meteen kan verkennen.

### Beperkingen (bewust, door de serverloze opzet)
- Inzendingen komen alleen bij de leerkracht terecht als leerling en leerkracht **dezelfde browseropslag** delen (klascode-scenario) — bij de draagbare link blijven resultaten op het toestel van de leerling.
- "Live" meekijken tijdens het maken is er niet; resultaten verschijnen na het indienen.

## ✅ Kwaliteitscontrole
- `npm run build` — TypeScript strict + Vite-build zonder waarschuwingen
- Playwright-rooktest (37 checks) over de volledige flow: landing → dashboard → editor → voorbeeldmodus → leerlingflow via code → resultaten & beoordeling → kruiswoord/woordzoeker/memory/rad/rekenen → nieuwe widget maken → draagbare deellink → joinpagina → donker thema. Zonder console-fouten.
