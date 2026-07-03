# 🎓 Didactische inschatting & roadmap

Dit document bundelt een analyse van WidgetFabriek door vijf didactische brillen:
**formatieve evaluatie**, **differentiatie & inclusie (UDL)**, **zelfregulerend leren**,
**werkdruk van de leerkracht** en **verantwoord/ethisch gebruik**. Per bril is gekeken
welke functionaliteiten de app didactisch sterker maken, wat al gebouwd is, en wat
bewust *niet* gebouwd wordt.

## ✅ Al ingebouwd op basis van deze analyse

| Feature | Didactische onderbouwing |
|---|---|
| **Hint per vraag** (leerling opent zelf; gebruik zichtbaar bij resultaten) | Scaffolding: tijdelijke steun voorkomt vastlopen of gokken. "Juist mét hint" is andere informatie dan "juist zonder hulp" — dat stuurt verlengde instructie. Hulp zoeken wordt niet bestraft. |
| **Zekerheidsgraad per vraag** (zeker/twijfel/gok) + kalibratiefeedback | Fouten met hoge zekerheid wijzen op misvattingen (hypercorrectie-effect); juist-maar-onzeker toont verborgen kennis. Traint metacognitieve zelfinschatting. Telt bewust nooit mee voor punten. |
| **"Oefen je fouten opnieuw"** na de feedback | Feedback wordt pas leren als de leerling er iets mee dóét; gerichte herhaalronde = retrieval practice op de items met de hoogste leerwinst. De oefenronde wordt niet ingediend. |
| **Rubrics bij open vragen** (criteria vooraf zichtbaar voor de leerling) | Succescriteria expliciteren (feed-up); beoordelen per criterium is sneller, consistenter en automatisch taakgericht. |
| **Vragenpool** (elke leerling een willekeurige deelverzameling) | Eerlijkheid via parallelvormen in plaats van surveillance; variatie vergroot bovendien het oefeneffect. |
| **Resultaatcode** (thuiswerk als gecomprimeerde code terug naar de leerkracht) | Dicht het grootste werkdruklek: geen scores overtypen bij thuisgebruik; de formatieve cyclus blijft rond. |
| **Toegankelijkheidsmenu** (tekstgrootte, letterafstand, rustmodus) | UDL: de leerling stemt de weergave zelf af, zonder stigma. Bewijs voor spacing/corps is sterker dan voor "dyslexiefonts". Rustmodus dempt animaties voor prikkelgevoelige leerlingen. |
| **Voorleesknop per vraag** (TTS) + accenttekens-balk | Meervoudige representatie; taalsteun verlaagt de leesdrempel zodat vakkennis gemeten wordt, niet leesvaardigheid. |
| **Opslaan & hervatten** + "opnieuw beginnen" op gedeelde toestellen | Werk gaat niet verloren; een schone lei voor de volgende leerling op een klas-pc. |
| **Vraagbank & bulk-import** | Hergebruik verlaagt werkdruk; één widget kan als itembank dienen voor herhaling en toetsen. |
| **Privacypagina + opschoonknoppen + naamhint ("voornaam volstaat")** | AVG: transparantie, dataminimalisatie, opslagbeperking en een praktisch uitvoerbaar verwijderrecht. Kindvriendelijke transparantiezin op het startscherm. |
| **Anonieme CSV-export** | De meeste analysevragen hebben geen namen nodig; de privacyvriendelijke keuze wordt de makkelijke keuze. |
| **Feedbackveld met taakgerichte prompt** | Feedback op taak en proces werkt; feedback op de persoon nauwelijks. De placeholder stuurt richting "wat lukt / wat nog niet / volgende stap". |
| **Toetsmodus** (volledig scherm + registratie venster-verlaten) | ⚠️ Bewust bescheiden gehouden en transparant naar de leerling. Zie kanttekening hieronder. |
| **Leerdoelen per vraag** + score-per-doel voor de leerling én doel-heatmap (leerlingen × doelen) voor de klassenraad | Feed-up én diagnostiek: "3/4 op werkwoordspelling" stuurt het vervolgleren, "7/10" niet. |
| **Getrapte feedback** (controleren per vraag: fout → hint + tweede kans → dán de oplossing) | Het juiste antwoord meteen weggeven ondermijnt het ophaal-effect; de tweede poging is zelf een leermoment. |
| **Foutenanalyse door de leerling** (fouten labelen + één voornemen; zichtbaar voor de leerkracht) | Exam-wrapper-principe: de toets wordt leermateriaal en attributie wordt gezond ("slordig gelezen" is beïnvloedbaar, "ik ben slecht in wiskunde" niet). |
| **Distractor-analyse per vraag** | "De halve klas kiest dezelfde foute optie bij vraag 4" is precies het signaal om de les van morgen bij te sturen. |
| **Nakijkcockpit** (per vráág verbeteren, met herbruikbare feedbackbank) | Eén beoordelingskader per vraag = sneller én consistenter; de bank maakt taakgerichte feedback goedkoop. |
| **Leitner-bakjes in flitskaarten** (persistent per toestel; lastige kaarten eerst) | Gespreid actief ophalen is een van de best onderbouwde leerstrategieën — de tool organiseert de spreiding zelf. |
| **Niveauroutes binnen één widget** (neutraal benoemd: route 1/2/3; opschuiven kan altijd) | Differentiatie zonder drie aparte werkbladen en zonder etikettering. |
| **Vraag-linter in de editor** | Bekende constructiefouten (te lange juiste optie, dubbele ontkenning, alleen herkenvragen) gesignaleerd op het moment dat het telt. |
| **Sjabloonbibliotheek** (3-2-1, troebelste punt, diagnostische instap, herhaalquiz met pool, practicum-stappenplan) | Lesdoel-eerst in plaats van leeg canvas; tijdwinst mét didactische kwaliteit. |
| **Aangepaste deellink** (tijd ×1,5 / geen limiet / extra poging — onzichtbaar voor klasgenoten) | Redelijke aanpassingen, discreet: geen hand opsteken, geen aparte behandeling. |
| **Instelbaar voorleestempo** | Trager voor zwakke lezers, vlotter voor geoefende luisteraars — per toestel onthouden. |

### Kanttekening bij de toetsmodus
Client-side anti-fraude is principieel te omzeilen (de correctiesleutel reist mee in de
draagbare link). De toetsmodus is daarom een **signaal, geen bewijs**: gebruik hem als
gespreksopener, niet als afrekening. Voor summatieve toetsen geldt: afname onder
toezicht, en liever **parallelvormen** (vragenpool + schudden) dan surveillance.
De leerling ziet altijd dat registratie aanstaat — geen verborgen monitoring.

## 🗺️ Aanbevolen vervolgstappen (didactisch geprioriteerd)

> ✅ De oorspronkelijke "hoge prioriteit"-lijst (leerdoelen, getrapte feedback,
> Leitner-flitskaarten, foutenanalyse, reflectiesjablonen, distractor-analyse,
> niveauroutes, sjabloonbibliotheek, nakijkcockpit, vraag-linter, aangepaste
> deellink en voorleestempo) is intussen **volledig geïmplementeerd** — zie de
> tabel hierboven.

> ✅ Ook de tweede kandidatenlijst is intussen geïmplementeerd:
> **meeleesmarkering** bij het voorlezen (boundary-events; oog-oorkoppeling),
> **steuntaal per vraag** (🌐, standaard dicht) en een **klikbaar glossarium**,
> **meerdere antwoordvormen** bij open vragen (typen/tekenen/inspreken, max. 60 s audio),
> **eigen sjablonen** (elke widget als herbruikbaar startpunt),
> **"Mijn voortgang"** voor de leerling (groei t.o.v. eigen eerdere pogingen — bewust geen klasgemiddelden),
> **persoonlijk doel** op het startscherm (proces- én streefdoelen, met reflectie achteraf),
> **item-analyse** (voorzichtige signalen, alleen bij n ≥ 8) en
> **vakgroeppakketten** (een map als één bestand delen met collega's, met dubbelendetectie bij import).

> ✅ Ook deze lijst is intussen geïmplementeerd: **zin-per-zin voorlezen** (🔊¹²³, met
> markering per zin), **sjablonen met invulvelden** (placeholders worden bij gebruik
> uitgevraagd), **leerdoelen over widgets heen** (aggregatie + heatmap op de
> resultatenpagina), **hintladders** (max. 3 oplopende hints; de leerkracht ziet hoeveel
> treden een leerling gebruikte) en het **exporteerbare voortgangsbestand** (leerling
> neemt voortgang mee naar een ander toestel).

### Volgende kandidaten
De client-side roadmap is hiermee afgewerkt. Wat didactisch nog waardevol is, vraagt
een (lichte) server: live klasoverzicht over toestellen heen, cijferdoorstroom naar
het LMS-puntenboek (LTI/Smartschool), en realtime samen ontwikkelen met collega's.

## ✨ AI-ondersteuning: uitgangspunten

De AI-laag (AI-studio, editor-assistent, cursusbouwer, feedbacksuggesties) volgt
vijf harde regels:

1. **De leerkracht blijft de auteur.** AI-uitvoer landt áltijd eerst in een
   voorvertoning; niets wordt bewaard zonder expliciete goedkeuring. De vraag-linter
   loopt ook over AI-gegenereerde vragen — dezelfde kwaliteitslat als voor handwerk.
2. **AI ondersteunt didactiek, niet andersom.** De prompts eisen plausibele
   afleiders, uitleg bij elk antwoord, hintladders, steuntaal en leerdoelkoppeling —
   de generatie is doordrenkt van dezelfde principes als de rest van de app.
   Bij cursusgeneratie vertrekt de AI van **leerplandoelen**, niet van "maak eens iets".
3. **Nooit beoordelen.** AI stelt feedbackteksten *voor* (taakgericht: wat lukt,
   wat nog niet, volgende stap) maar kent nooit punten toe. De leerkracht leest,
   past aan en beslist. Zekerheidsdata en reflecties van leerlingen gaan nooit naar de AI.
4. **Dataminimalisatie.** Geen leerlingnamen in prompts; feedbacksuggesties sturen
   alleen het (anonieme) antwoord mee. De API-sleutel staat lokaal; elk gebruik is
   zichtbaar in een tokenlogboek (kostentransparantie).
5. **Eerlijk over de grens.** De privacypagina zegt expliciet wat er bij AI-gebruik
   het toestel verlaat en naar wie. AI-functies zijn uit tot de leerkracht ze zelf activeert.

## 📚 Cursusmodule: uitgangspunten

- **Feed-up ingebouwd**: secties dragen leerdoelen; elke AI-gegenereerde sectie opent
  met een doelen-kader. Keuzesecties ("verdieping") tellen niet mee voor "afgewerkt" —
  differentiatie zonder aparte cursussen.
- **Verwerking naast leerstof**: ingebedde widgets maken van lezen dóén; resultaten
  lopen door de bestaande resultaten- en doelenanalyse.
- **Voortgang als gespreksopener, geen bewijs**: leestijd wordt getoond als context
  ("waar haakt de klas af?"), uitdrukkelijk niet als beoordelingsdata. De leerling
  ziet exact dezelfde voortgang als de leerkracht — geen verborgen tracking.
- **Delen in stukken**: per hoofdstuk deelbaar, zodat een cursus kan meegroeien met
  de lessenreeks in plaats van alles ineens te dumpen.

### Vergt een (lichte) server — bewust op de lange baan
- Live klasoverzicht over toestellen heen (Live Widgets-equivalent).
- Cijferdoorstroom naar Smartschool/LMS-puntenboek (LTI).
- Echte co-editing met collega's. *(Bestandsuitwisseling en groepspakketten kunnen wel client-side.)*

## 🚫 Bewust NIET te bouwen (didactische valkuilen)

- **Leaderboards of publieke scorevergelijking** — verschuift de aandacht van beheersing naar positie; demotiveert precies wie de oefening het hardst nodig heeft. Hooguit: anoniem vergelijken met je eigen vorige poging.
- **Zware proctoring** (webcam, copy-paste-blokkade, verborgen tab-detectie) — client-side schijnveiligheid, kweekt wantrouwen en introduceert voor het eerst écht privacy-invasieve dataverzameling.
- **Streaks, XP en badge-economieën** — retentiemechanismen die extrinsieke motivatie stapelen op taken die intrinsiek interessant kunnen zijn; bij kinderen extra kwestieus.
- **Zelfevaluatie laten meetellen voor punten** — dan wordt de data sociaal wenselijk en waardeloos.
- **Automatisch "leerlingniveau" onthouden over widgets heen** — differentiatie mag geen selffulfilling prophecy worden; routes blijven per oefening en opschuiven kan altijd.
- **Verplichte reflectie bij elke widget** — reflectiemoeheid maakt van metacognitie een invulritueel; leerkracht kiest per widget.
- **Werktempo als beoordelingsdata presenteren** — snelheid correleert slecht met begrip; duur is context, geen oordeel.

## 📌 Algemene ontwerpprincipes die de app volgt

1. **Fouten zijn informatie** — feedback- en oefenmodi staan centraal; scores kunnen verborgen worden (formatief gebruik).
2. **De leerkracht houdt de regie** — elke didactische feature is een keuze per widget, geen opgelegde standaard.
3. **Steun is afbouwbaar** — hints, taalsteun en toegankelijkheidsopties zijn er als vangnet, standaard dicht, één klik open.
4. **Dataminimalisatie by design** — voornaam volstaat, lokaal opgeslagen, opruimbaar, transparant uitgelegd aan kind én ouder.
5. **Eerlijk over beperkingen** — wat client-side niet waterdicht kan (anti-fraude, centrale resultaten), zegt de app eerlijk in plaats van het te verhullen.
