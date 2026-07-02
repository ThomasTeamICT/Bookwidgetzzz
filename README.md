# 🧩 WidgetFabriek

Een volledig functionele webapplicatie om **interactieve oefeningen, toetsen en spelletjes** voor je klas te maken, te delen en op te volgen — geïnspireerd op het concept van digitale les-widgets. Alles draait 100% in de browser: geen server, geen account, geen installatie.

## ✨ Functies

### 20 widgettypes, in 5 categorieën

| Categorie | Widgets |
|---|---|
| 📝 **Toetsen & opdrachten** | Quiz · Werkblad · Exit-ticket · Dictee (spraakstem) · Peiling |
| 🎮 **Spelletjes** | Flitskaarten · Kruiswoordraadsel · Woordzoeker · Memory · Galgje · Koppelspel · Husselwoorden · Bingo |
| 🖼️ **Beeld & verkennen** | Tijdlijn · Hotspot-afbeelding · Whiteboard (tekenopdracht) |
| 🧮 **Rekenen** | Rekenoefening (sommen & maaltafels, automatisch gegenereerd) |
| 🧑‍🏫 **Klashulpjes** | Rad van fortuin · Klastimer · Checklist |

### De quiz ondersteunt 11 vraagtypes
Meerkeuze · meerdere antwoorden · juist/onjuist · kort antwoord · open vraag (manueel beoordeeld) · invuloefening met gaten `[zo|alternatief]` · koppelparen · rangschikken · getal met tolerantie · schuiver · infoblok.

### Voor de leerkracht
- **Dashboard** met mappen (kleuren), zoeken, dupliceren, verwijderen
- **Editor** met live voorbeeldmodus ("Uitproberen"), automatisch opslaan en per-widget instellingen:
  accentkleur, instructies, schudden, feedback/score tonen, **tijdslimiet**, **maximum aantal pogingen**, naamverplichting
- **Resultaten**: scoreoverzicht per leerling, per-vraagstatistieken, detail per inzending,
  **manuele beoordeling** van open vragen en tekeningen, feedback voor de leerling, **CSV-export**
- **Delen** op drie manieren:
  1. **Klascode** (6 tekens) — leerlingen klikken op *Ik ben leerling* en typen de code (zelfde browser/toestel, bv. klas-pc of gedeeld device)
  2. **Draagbare link** — de volledige widget zit gecomprimeerd (lz-string) in de URL en werkt dus op élk toestel zonder server
  3. **JSON-bestand** — exporteren/importeren tussen toestellen of collega's

### Voor de leerling
- Startscherm met naam, instructies en tijdsindicatie
- Voortgangsbalk, aftellende timer, automatisch indienen als de tijd om is
- Direct feedback met juiste antwoorden en uitleg (indien de leerkracht dat toestaat)
- Score-ring en vriendelijke resultaatschermen

### UX & toegankelijkheid
- Modern, rustig ontwerp met **licht/donker/automatisch thema**
- Volledig **toetsenbordbedienbaar** (focusstijlen, focus-trap in modals, pijltjesnavigatie in het kruiswoordraadsel, spatie om flitskaarten te draaien)
- ARIA-rollen en live-regions voor schermlezers, `prefers-reduced-motion` wordt gerespecteerd
- Responsief tot op smartphoneformaat; speelvlakken scrollen horizontaal waar nodig

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
