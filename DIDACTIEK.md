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

### Kanttekening bij de toetsmodus
Client-side anti-fraude is principieel te omzeilen (de correctiesleutel reist mee in de
draagbare link). De toetsmodus is daarom een **signaal, geen bewijs**: gebruik hem als
gespreksopener, niet als afrekening. Voor summatieve toetsen geldt: afname onder
toezicht, en liever **parallelvormen** (vragenpool + schudden) dan surveillance.
De leerling ziet altijd dat registratie aanstaat — geen verborgen monitoring.

## 🗺️ Aanbevolen vervolgstappen (didactisch geprioriteerd)

### Hoge prioriteit (haalbaar client-side)
1. **Leerdoelen als feed-up** — leerdoel-tags per vraag; resultaat per doel i.p.v. alleen een totaalscore ("3/4 op werkwoordspelling" stuurt het leren, "7/10" niet). Ook als heatmap doelen × leerlingen voor de klassenraad.
2. **Getrapte feedback** — bij een fout eerst een hint en een tweede poging, pas daarna het juiste antwoord met uitleg. Direct het antwoord weggeven ondermijnt het ophaal-effect.
3. **Leitner-herhaalschema in flitskaarten** — gekende kaarten later terug, moeilijke sneller; "vandaag te herhalen"-teller. Gespreid ophalen is een van de best onderbouwde leerstrategieën.
4. **Foutenanalyse door de leerling** — na de feedback fouten labelen (slordig / verkeerd gelezen / stof niet gekend / aanpak fout) + één zin "volgende keer…". Exam-wrapper-principe; stuurt gezonde attributie.
5. **Reflectiesjablonen voor exit-tickets** — 3-2-1, troebelste punt, stoplicht; puntloos. Het exit-ticket wordt zo reflectie-instrument in plaats van mini-toets.
6. **Distractor-analyse per vraag** — welke foute optie koos de klas het vaakst? Misconceptie-detector voor de les van morgen.
7. **Niveaulagen binnen één widget** (basis/kern/uitbreiding met neutrale namen) — differentiatie zonder drie aparte werkbladen en zonder etikettering.
8. **Sjabloonbibliotheek** met lesdoel-eerst-flow en eigen sjablonen met invulvelden.
9. **Nakijkcockpit**: per vráág verbeteren (alle antwoorden op vraag 3 onder elkaar) + herbruikbare feedbackbank.
10. **Vraag-linter**: waarschuwt voor bekende constructiefouten (te korte afleiders, dubbele ontkenning, alleen reproductievragen).
11. **Aangepaste deellink per leerling** (tijd ×1,5, hints open, voorlezen aan) — redelijke aanpassingen, discreet.
12. **Meeleesmarkering bij voorlezen** (Web Speech boundary-events) + instelbaar tempo.

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
