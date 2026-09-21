import type { Widget } from './types';
import type { Curriculum } from './curriculumTypes';
import { getPrefs, getWidgets, savePrefs, saveWidget } from './storage';
import { EXAMPLE_CURRICULUM_ID, getCurricula, getCurriculum, saveCurriculum } from './curriculum';
import { createWidget } from '../widgets/registry';
import { uid } from './utils';
import { ensureDemoCourse } from './courses';
import { seedExampleClass } from './classes';

// ── Voorbeeldleerplan ───────────────────────────────────────────────────────
//
// Géén officieel document: een geloofwaardig uittreksel zodat de doelenlijst,
// de dekking en de heatmaps meteen iets tonen. De échte leerplannen haal je
// bij je net (zie de callout op /leerplannen).

const EXAMPLE_GOALS: { code: string; text: string; theme: string; level?: 'basis' | 'uitbreiding'; note?: string }[] = [
  { code: 'NW 1.1', theme: 'Wetenschappelijke vaardigheden', text: 'De leerlingen voeren onder begeleiding een eenvoudig onderzoek uit volgens de stappen van de onderzoekscyclus.', level: 'basis' },
  { code: 'NW 1.2', theme: 'Wetenschappelijke vaardigheden', text: 'De leerlingen noteren waarnemingen en meetresultaten nauwkeurig in een tabel.', level: 'basis' },
  { code: 'NW 1.3', theme: 'Wetenschappelijke vaardigheden', text: 'De leerlingen stellen meetresultaten voor in een grafiek en lezen er gegevens uit af.', level: 'basis' },
  { code: 'NW 1.4', theme: 'Wetenschappelijke vaardigheden', text: 'De leerlingen beoordelen de betrouwbaarheid van hun meetresultaten en stellen verbeteringen voor.', level: 'uitbreiding' },
  { code: 'NW 2.1', theme: 'Materie', text: 'De leerlingen onderscheiden de drie aggregatietoestanden van een stof aan de hand van waarneembare kenmerken.', level: 'basis' },
  { code: 'NW 2.2', theme: 'Materie', text: 'De leerlingen beschrijven de toestandsveranderingen smelten, stollen, verdampen en condenseren met voorbeelden uit het dagelijks leven.', level: 'basis' },
  { code: 'NW 2.3', theme: 'Materie', text: 'De leerlingen leggen met het deeltjesmodel uit waarom een stof van toestand verandert bij verwarmen of afkoelen.', level: 'uitbreiding' },
  { code: 'NW 3.1', theme: 'Energie', text: 'De leerlingen geven voorbeelden van energiebronnen en energieomzettingen in en om de school.', level: 'basis' },
  { code: 'NW 3.2', theme: 'Energie', text: 'De leerlingen lichten toe dat de zon de belangrijkste energiebron is voor processen op aarde.', level: 'basis' },
  { code: 'NW 3.3', theme: 'Energie', text: 'De leerlingen onderzoeken hoe warmte zich verplaatst en geven voorbeelden van isolatie.', level: 'basis' },
  { code: 'NW 4.1', theme: 'Systeem aarde', text: 'De leerlingen beschrijven de waterkringloop met de begrippen verdamping, condensatie, neerslag en infiltratie.', level: 'basis', note: 'Sluit aan bij de toestandsveranderingen uit NW 2.2.' },
  { code: 'NW 4.2', theme: 'Systeem aarde', text: 'De leerlingen verklaren hoe wolken en neerslag ontstaan.', level: 'basis' },
  { code: 'NW 4.3', theme: 'Systeem aarde', text: 'De leerlingen geven het belang van zoet water voor mens en natuur aan en illustreren hoe menselijk handelen de waterkwaliteit beïnvloedt.', level: 'basis' },
  { code: 'NW 4.4', theme: 'Systeem aarde', text: 'De leerlingen leggen het verband tussen de waterkringloop en weersverschijnselen in onze streken.', level: 'uitbreiding' },
];

/**
 * Plaatst het voorbeeldleerplan als er nog geen enkel leerplan is. Idempotent:
 * bestaat het al (op id), dan gebeurt er niets; werkt de leerkracht al met
 * eigen leerplannen, dan dringen we ons voorbeeld niet op.
 */
export function ensureExampleCurriculum(): Curriculum | undefined {
  const existing = getCurriculum(EXAMPLE_CURRICULUM_ID);
  if (existing) return existing;
  if (getCurricula().length > 0) return undefined;
  const now = Date.now();
  const cur: Curriculum = {
    id: EXAMPLE_CURRICULUM_ID,
    title: 'Voorbeeld — natuurwetenschappen 1e graad: doelenlijst (uittreksel, geen officieel document)',
    net: 'eigen',
    subject: 'Natuurwetenschappen',
    level: '1e graad A-stroom',
    source: 'Voorbeeldmateriaal van Boosterz — vervang dit door je eigen leerplan of de minimumdoelen.',
    example: true,
    goals: EXAMPLE_GOALS.map((g) => ({ id: uid(), ...g })),
    createdAt: now,
    updatedAt: now,
  };
  saveCurriculum(cur);
  return cur;
}

/** Plaatst een paar voorbeeldwidgets bij het allereerste bezoek. */
export function seedIfEmpty() {
  ensureExampleCurriculum();
  const prefs = getPrefs();
  if (prefs.seeded || getWidgets().length > 0) return;

  const widgets: Widget[] = [];

  const quiz = createWidget('quiz', 'Voorbeeld: quiz over België');
  quiz.settings.instructions = 'Dit is een voorbeeldquiz. Probeer alle vraagtypes eens uit!';
  quiz.config = {
    layout: 'single',
    questions: [
      { id: uid(), type: 'mc', prompt: 'Wat is de hoofdstad van België?', points: 1, options: ['Antwerpen', 'Brussel', 'Gent', 'Luik'], correctIndex: 1, explanation: 'Brussel is de hoofdstad én de zetel van de federale regering.' },
      { id: uid(), type: 'multi', prompt: 'Welke van deze talen zijn officiële landstalen van België?', points: 2, options: ['Nederlands', 'Frans', 'Engels', 'Duits'], correctIndices: [0, 1, 3], explanation: 'België heeft drie officiële talen: Nederlands, Frans en Duits.' },
      { id: uid(), type: 'tf', prompt: 'De Schelde mondt uit in de Noordzee.', points: 1, answer: true },
      { id: uid(), type: 'gap', prompt: 'Vul aan:', points: 2, text: 'België werd onafhankelijk in [1830] en de eerste koning was [Leopold|Leopold I].' },
      { id: uid(), type: 'match', prompt: 'Koppel de stad aan haar provincie.', points: 2, pairs: [ { left: 'Brugge', right: 'West-Vlaanderen' }, { left: 'Hasselt', right: 'Limburg' }, { left: 'Leuven', right: 'Vlaams-Brabant' } ] },
      { id: uid(), type: 'order', prompt: 'Zet deze steden van west naar oost.', points: 2, items: ['Oostende', 'Gent', 'Brussel', 'Luik'] },
      { id: uid(), type: 'number', prompt: 'Hoeveel provincies telt Vlaanderen?', points: 1, answer: 5, tolerance: 0 },
      { id: uid(), type: 'long', prompt: 'Leg in je eigen woorden uit waarom België een federale staat is.', points: 3, modelAnswer: 'Bevoegdheden zijn verdeeld over federale overheid, gemeenschappen en gewesten…' },
    ],
  };
  widgets.push(quiz);

  const flash = createWidget('flashcards', 'Voorbeeld: Frans — les animaux');
  flash.config = {
    autoFlipSec: 0,
    cards: [
      { id: uid(), front: 'le chien', back: 'de hond' },
      { id: uid(), front: 'le chat', back: 'de kat' },
      { id: uid(), front: 'le cheval', back: 'het paard' },
      { id: uid(), front: "l'oiseau", back: 'de vogel' },
      { id: uid(), front: 'le poisson', back: 'de vis' },
    ],
  };
  widgets.push(flash);

  const cross = createWidget('crossword', 'Voorbeeld: kruiswoord natuur');
  cross.config = {
    entries: [
      { id: uid(), word: 'fotosynthese', clue: 'Proces waarbij planten licht omzetten in energie' },
      { id: uid(), word: 'stengel', clue: 'Draagt de bladeren en bloemen van een plant' },
      { id: uid(), word: 'wortel', clue: 'Ondergronds deel van de plant' },
      { id: uid(), word: 'blad', clue: 'Groen orgaan waar fotosynthese plaatsvindt' },
      { id: uid(), word: 'nectar', clue: 'Zoete stof die bijen lokt' },
      { id: uid(), word: 'bestuiving', clue: 'Overdracht van stuifmeel' },
    ],
  };
  widgets.push(cross);

  const ws = createWidget('wordsearch', 'Voorbeeld: woordzoeker weer');
  ws.config = {
    words: ['regen', 'zon', 'wolk', 'storm', 'hagel', 'sneeuw', 'wind', 'mist'],
    size: 10, allowDiagonal: true, allowReverse: false,
  };
  widgets.push(ws);

  const memory = createWidget('memory', 'Voorbeeld: memory hoofdsteden');
  memory.config = {
    pairs: [
      { id: uid(), a: 'Frankrijk', b: 'Parijs' },
      { id: uid(), a: 'Spanje', b: 'Madrid' },
      { id: uid(), a: 'Italië', b: 'Rome' },
      { id: uid(), a: 'Duitsland', b: 'Berlijn' },
      { id: uid(), a: 'Portugal', b: 'Lissabon' },
      { id: uid(), a: 'Polen', b: 'Warschau' },
    ],
  };
  widgets.push(memory);

  const rekenen = createWidget('arithmetic', 'Voorbeeld: maaltafels 6, 7 en 8');
  rekenen.config = { ops: ['mul'], min: 1, max: 10, count: 10, tables: [6, 7, 8] };
  widgets.push(rekenen);

  const rad = createWidget('spinner', 'Voorbeeld: wie is aan de beurt?');
  rad.config = { items: ['Emma', 'Noah', 'Olivia', 'Lucas', 'Mila', 'Arthur', 'Julia', 'Louis'], removeAfterSpin: true };
  widgets.push(rad);

  const exit = createWidget('exitticket', 'Sjabloon: 3-2-1 exit-ticket');
  exit.settings.showScore = false;
  exit.settings.instructions = 'Geen punten — dit helpt je leerkracht om de volgende les beter af te stemmen.';
  exit.config = {
    layout: 'single',
    questions: [
      { id: uid(), type: 'long', prompt: 'Noem 3 dingen die je vandaag geleerd hebt.', points: 0, modelAnswer: '' },
      { id: uid(), type: 'long', prompt: 'Schrijf 2 vragen die je nog hebt.', points: 0, modelAnswer: '' },
      { id: uid(), type: 'long', prompt: 'Geef 1 voorbeeld van hoe je dit buiten de les kan gebruiken.', points: 0, modelAnswer: '' },
      { id: uid(), type: 'slider', prompt: 'Hoe goed snap je de leerstof van vandaag?', points: 0, min: 1, max: 10, step: 1, answer: 10, tolerance: 9, explanation: '' },
    ],
  };
  widgets.push(exit);

  const tijdlijn = createWidget('timeline', 'Voorbeeld: tijdlijn wereldoorlogen');
  tijdlijn.config = {
    mode: 'exercise',
    events: [
      { id: uid(), date: '1914', title: 'Begin van de Eerste Wereldoorlog' },
      { id: uid(), date: '1918', title: 'Wapenstilstand van 11 november' },
      { id: uid(), date: '1929', title: 'Beurskrach van Wall Street' },
      { id: uid(), date: '1939', title: 'Begin van de Tweede Wereldoorlog' },
      { id: uid(), date: '1945', title: 'Bevrijding en einde van WO II' },
    ],
  };
  widgets.push(tijdlijn);

  const splitws = createWidget('splitworksheet', 'Voorbeeld: begrijpend lezen — de honingbij');
  splitws.config = {
    source: {
      kind: 'text',
      title: 'De honingbij: klein maar onmisbaar',
      text: 'Een honingbijvolk telt in de zomer tot 50.000 bijen. Elke werkster heeft een taak: jonge bijen poetsen de raten en voeden de larven, oudere bijen vliegen uit om nectar en stuifmeel te verzamelen. Met de bijendans vertelt een speurbij aan haar zussen in welke richting en op welke afstand een veld vol bloemen ligt.\n\nBijen zijn onmisbaar voor onze voeding: ongeveer een derde van wat wij eten bestaat dankzij de bestuiving door insecten. Toch gaat het niet goed met de bij. Pesticiden, ziektes en het verdwijnen van bloemenweides maken het leven van een bijenvolk moeilijk. Gelukkig kan iedereen helpen: zaai bloemen die veel nectar geven en gebruik geen gif in de tuin.',
    },
    questions: [
      { id: uid(), type: 'mc', prompt: 'Hoe vertelt een speurbij aan de andere bijen waar bloemen te vinden zijn?', points: 1, options: ['Door luid te zoemen', 'Met een dans', 'Met geurstoffen op de raat', 'Door ze mee te nemen'], correctIndex: 1, explanation: 'De bijendans geeft richting én afstand door.' },
      { id: uid(), type: 'tf', prompt: 'Ongeveer de helft van ons voedsel bestaat dankzij bestuiving door insecten.', points: 1, answer: false, explanation: 'Het is ongeveer een derde.' },
      { id: uid(), type: 'short', prompt: 'Hoeveel bijen telt een bijenvolk in de zomer maximaal?', points: 1, accepted: ['50.000', '50000', 'vijftigduizend'], caseSensitive: false },
      { id: uid(), type: 'long', prompt: 'Wat kan jij zelf doen om bijen te helpen? Geef twee voorbeelden.', points: 2, modelAnswer: 'Nectarrijke bloemen zaaien, geen pesticiden gebruiken, een bijenhotel plaatsen…', rubric: [{ criterion: 'Geeft twee verschillende voorbeelden', points: 1 }, { criterion: 'Voorbeelden passen bij de tekst of eigen ervaring', points: 1 }] },
    ],
  };
  widgets.push(splitws);

  const grafiek = createWidget('chart', 'Voorbeeld: grafiek — huisdieren in de klas');
  grafiek.config = {
    chartType: 'bar',
    title: 'Hoeveel huisdieren hebben wij?',
    labels: ['Hond', 'Kat', 'Konijn', 'Vis', 'Geen'],
    values: [7, 9, 3, 5, 4],
    studentEditable: true,
  };
  widgets.push(grafiek);

  const mindmap = createWidget('mindmap', 'Voorbeeld: mindmap — de waterkringloop');
  mindmap.config = {
    root: 'De waterkringloop',
    outline: 'Verdamping\n  Zon verwarmt het water\n  Van zee, meren en rivieren\nCondensatie\n  Waterdamp koelt af\n  Wolken ontstaan\nNeerslag\n  Regen\n  Sneeuw en hagel\nInfiltratie\n  Water zakt in de grond\n  Grondwater',
    studentEditable: false,
  };
  widgets.push(mindmap);

  // Proefwerkblad met de uitgebreide vraagtypes — zo ontdekt de leerkracht ze meteen.
  const extra = createWidget('worksheet', 'Voorbeeld: alle nieuwe vraagtypes');
  extra.settings.instructions = 'Proef van de nieuwste vraagtypes: keuzelijsten, markeren, sorteren, invultabel en meer.';
  extra.config = {
    layout: 'scroll',
    questions: [
      { id: uid(), type: 'dropdown', prompt: 'Kies telkens het juiste woord.', points: 2, shuffle: true,
        text: 'Water {verdampt|bevriest|smelt} door de warmte van de zon en stijgt op als {waterdamp|regen|hagel}.' },
      { id: uid(), type: 'marktext', prompt: 'Markeer alle werkwoorden in de zin.', points: 2, penalizeWrong: false,
        text: 'De zon [schijnt] fel, de vogels [fluiten] in de bomen en wij [wandelen] naar school.' },
      { id: uid(), type: 'sort', prompt: 'Sorteer de dieren in de juiste groep.', points: 3,
        categories: [{ id: 'c1', name: 'Zoogdieren' }, { id: 'c2', name: 'Vogels' }],
        items: [
          { id: 'i1', text: 'walvis', categoryId: 'c1' }, { id: 'i2', text: 'merel', categoryId: 'c2' },
          { id: 'i3', text: 'vleermuis', categoryId: 'c1' }, { id: 'i4', text: 'pinguïn', categoryId: 'c2' },
        ] },
      { id: uid(), type: 'table', prompt: 'Vul de tabel aan.', points: 2, caseSensitive: false,
        columns: ['Land', 'Hoofdstad'],
        rows: [
          { id: 'r1', cells: ['België', ''], answers: [null, 'Brussel'] },
          { id: 'r2', cells: ['Frankrijk', ''], answers: [null, 'Parijs'] },
        ] },
      { id: uid(), type: 'likert', prompt: 'Hoe kijk jij terug op deze les?', points: 0,
        statements: [{ id: 's1', text: 'Ik begreep de leerstof goed.' }, { id: 's2', text: 'Het tempo lag goed.' }],
        options: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'] },
      { id: uid(), type: 'rating', prompt: 'Hoeveel sterren geef je deze oefening?', points: 0, scale: 5 },
    ],
  };
  widgets.push(extra);

  for (const w of widgets) saveWidget(w);
  savePrefs({ ...prefs, seeded: true });
  // Voorbeeldklas met opdrachten voor de democursus en een voorbeeldwidget.
  // De democursus eerst, anders heeft de klas niets om aan te wijzen.
  // Idempotent (eigen vlag 'wf.classes.seeded.v1'): verwijderd blijft verwijderd.
  ensureDemoCourse();
  seedExampleClass();
}
