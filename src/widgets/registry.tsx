import React from 'react';
import type { Widget, WidgetCategory, WidgetSettings, WidgetTypeId } from '../lib/types';
import { makeCode, uid } from '../lib/utils';
import type { EditorProps, PlayerProps } from './shared';

/**
 * Wikkelt een dynamic import in React.lazy zodat een widgetmodule pas geladen
 * wordt bij de eerste render (achter <React.Suspense> op de render-plekken) en
 * dus niet in de hoofdbundel belandt. LazyExoticComponent gedraagt zich als een
 * gewone ComponentType; de cast houdt WidgetTypeDef eenvoudig.
 */
function lazyWidget<P>(load: () => Promise<{ default: React.ComponentType<P> }>): React.ComponentType<P> {
  return React.lazy(load) as React.ComponentType<P>;
}

export interface WidgetTypeDef {
  id: WidgetTypeId;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  category: WidgetCategory;
  /** Levert deze widget inzendingen/resultaten op voor de leerkracht? */
  hasSubmissions: boolean;
  /** Heeft deze widget een score? (voor resultatenweergave) */
  hasScore: boolean;
  /** Brede spelersweergave (bv. gesplitste layouts, plots, puzzels). */
  wide?: boolean;
  defaultConfig: () => unknown;
  Editor: React.ComponentType<EditorProps<any>>;
  Player: React.ComponentType<PlayerProps<any>>;
}

export const CATEGORIES: { id: WidgetCategory; name: string; icon: string }[] = [
  { id: 'test', name: 'Toetsen & opdrachten', icon: '📝' },
  { id: 'game', name: 'Spelletjes', icon: '🎮' },
  { id: 'picture', name: 'Beeld & verkennen', icon: '🖼️' },
  { id: 'math', name: 'Rekenen', icon: '🧮' },
  { id: 'classroom', name: 'Klashulpjes', icon: '🧑‍🏫' },
];

export const WIDGET_TYPES: WidgetTypeDef[] = [
  {
    id: 'quiz', name: 'Quiz', tagline: 'Toets met 11 vraagtypes en automatische verbetering', icon: '❓',
    color: '#4f46e5', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ questions: [], layout: 'single' }),
    Editor: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizEditor }))),
    Player: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizPlayer }))),
  },
  {
    id: 'worksheet', name: 'Werkblad', tagline: 'Oefenblad met vragen en infoblokken onder elkaar', icon: '📄',
    color: '#0891b2', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ questions: [], layout: 'scroll' }),
    Editor: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizEditor }))),
    Player: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizPlayer }))),
  },
  {
    id: 'exitticket', name: 'Exit-ticket', tagline: 'Korte check aan het einde van de les', icon: '🎟️',
    color: '#e11d48', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ questions: [], layout: 'single' }),
    Editor: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizEditor }))),
    Player: lazyWidget(() => import('./quiz').then((m) => ({ default: m.QuizPlayer }))),
  },
  {
    id: 'dictation', name: 'Dictee', tagline: 'Zinnen beluisteren en typen (spraakstem)', icon: '🔊',
    color: '#7c3aed', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ sentences: [], lang: 'nl-BE', rate: 0.85 }),
    Editor: lazyWidget(() => import('./dictation').then((m) => ({ default: m.DictationEditor }))),
    Player: lazyWidget(() => import('./dictation').then((m) => ({ default: m.DictationPlayer }))),
  },
  {
    id: 'poll', name: 'Peiling', tagline: 'Stemmen en meningen verzamelen', icon: '🗳️',
    color: '#0d9488', category: 'test', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ question: '', options: ['', ''], allowMultiple: false, showResults: true }),
    Editor: lazyWidget(() => import('./poll').then((m) => ({ default: m.PollEditor }))),
    Player: lazyWidget(() => import('./poll').then((m) => ({ default: m.PollPlayer }))),
  },
  {
    id: 'flashcards', name: 'Flitskaarten', tagline: 'Studeerkaarten met voor- en achterkant', icon: '🃏',
    color: '#d97706', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ cards: [], autoFlipSec: 0 }),
    Editor: lazyWidget(() => import('./flashcards').then((m) => ({ default: m.FlashcardsEditor }))),
    Player: lazyWidget(() => import('./flashcards').then((m) => ({ default: m.FlashcardsPlayer }))),
  },
  {
    id: 'crossword', name: 'Kruiswoordraadsel', tagline: 'Automatisch gegenereerd rooster', icon: '✏️',
    color: '#4338ca', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ entries: [] }),
    Editor: lazyWidget(() => import('./crossword').then((m) => ({ default: m.CrosswordEditor }))),
    Player: lazyWidget(() => import('./crossword').then((m) => ({ default: m.CrosswordPlayer }))),
  },
  {
    id: 'wordsearch', name: 'Woordzoeker', tagline: 'Woorden zoeken in een letterrooster', icon: '🔍',
    color: '#059669', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ words: [], size: 12, allowDiagonal: true, allowReverse: false }),
    Editor: lazyWidget(() => import('./wordsearch').then((m) => ({ default: m.WordsearchEditor }))),
    Player: lazyWidget(() => import('./wordsearch').then((m) => ({ default: m.WordsearchPlayer }))),
  },
  {
    id: 'memory', name: 'Memory', tagline: 'Paren zoeken met omgedraaide kaarten', icon: '🧠',
    color: '#db2777', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ pairs: [] }),
    Editor: lazyWidget(() => import('./memory').then((m) => ({ default: m.MemoryEditor }))),
    Player: lazyWidget(() => import('./memory').then((m) => ({ default: m.MemoryPlayer }))),
  },
  {
    id: 'hangman', name: 'Galgje', tagline: 'Woorden raden, letter per letter', icon: '🎈',
    color: '#ea580c', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ words: [], maxErrors: 8 }),
    Editor: lazyWidget(() => import('./hangman').then((m) => ({ default: m.HangmanEditor }))),
    Player: lazyWidget(() => import('./hangman').then((m) => ({ default: m.HangmanPlayer }))),
  },
  {
    id: 'pairs', name: 'Koppelspel', tagline: 'Items uit twee kolommen bij elkaar zoeken', icon: '🔗',
    color: '#2563eb', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ pairs: [{ id: uid(), left: '', right: '' }, { id: uid(), left: '', right: '' }] }),
    Editor: lazyWidget(() => import('./pairs').then((m) => ({ default: m.PairsEditor }))),
    Player: lazyWidget(() => import('./pairs').then((m) => ({ default: m.PairsPlayer }))),
  },
  {
    id: 'scramble', name: 'Husselwoorden', tagline: 'Letters of zinnen in de juiste volgorde zetten', icon: '🔀',
    color: '#9333ea', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ mode: 'word', items: [] }),
    Editor: lazyWidget(() => import('./scramble').then((m) => ({ default: m.ScrambleEditor }))),
    Player: lazyWidget(() => import('./scramble').then((m) => ({ default: m.ScramblePlayer }))),
  },
  {
    id: 'bingo', name: 'Bingo', tagline: 'Willekeurige bingokaart per leerling', icon: '🎱',
    color: '#dc2626', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ items: [], size: 4, freeCenter: true }),
    Editor: lazyWidget(() => import('./bingo').then((m) => ({ default: m.BingoEditor }))),
    Player: lazyWidget(() => import('./bingo').then((m) => ({ default: m.BingoPlayer }))),
  },
  {
    id: 'timeline', name: 'Tijdlijn', tagline: 'Gebeurtenissen bekijken of rangschikken', icon: '📅',
    color: '#0284c7', category: 'picture', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ events: [], mode: 'view' }),
    Editor: lazyWidget(() => import('./timeline').then((m) => ({ default: m.TimelineEditor }))),
    Player: lazyWidget(() => import('./timeline').then((m) => ({ default: m.TimelinePlayer }))),
  },
  {
    id: 'hotspot', name: 'Hotspot-afbeelding', tagline: 'Punten op een afbeelding verkennen of aanwijzen', icon: '📍',
    color: '#65a30d', category: 'picture', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ imageUrl: '', hotspots: [], mode: 'explore' }),
    Editor: lazyWidget(() => import('./hotspot').then((m) => ({ default: m.HotspotEditor }))),
    Player: lazyWidget(() => import('./hotspot').then((m) => ({ default: m.HotspotPlayer }))),
  },
  {
    id: 'whiteboard', name: 'Whiteboard', tagline: 'Tekenopdracht — tekening komt bij de resultaten', icon: '🎨',
    color: '#c026d3', category: 'picture', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ prompt: '', backgroundImageUrl: undefined }),
    Editor: lazyWidget(() => import('./whiteboard').then((m) => ({ default: m.WhiteboardEditor }))),
    Player: lazyWidget(() => import('./whiteboard').then((m) => ({ default: m.WhiteboardPlayer }))),
  },
  {
    id: 'arithmetic', name: 'Rekenoefening', tagline: 'Automatisch gegenereerde sommen en tafels', icon: '🧮',
    color: '#16a34a', category: 'math', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ ops: ['add', 'sub'], min: 1, max: 20, count: 10, tables: [] }),
    Editor: lazyWidget(() => import('./arithmetic').then((m) => ({ default: m.ArithmeticEditor }))),
    Player: lazyWidget(() => import('./arithmetic').then((m) => ({ default: m.ArithmeticPlayer }))),
  },
  {
    id: 'splitworksheet', name: 'Gesplitst werkblad', tagline: 'Bron (tekst, beeld of video) naast de vragen', icon: '📑',
    color: '#0e7490', category: 'test', hasSubmissions: true, hasScore: true, wide: true,
    defaultConfig: () => ({ source: { kind: 'text', text: '', title: '' }, questions: [] }),
    Editor: lazyWidget(() => import('./splitworksheet').then((m) => ({ default: m.SplitWorksheetEditor }))),
    Player: lazyWidget(() => import('./splitworksheet').then((m) => ({ default: m.SplitWorksheetPlayer }))),
  },
  {
    id: 'videoquiz', name: 'Video-quiz', tagline: 'Video pauzeert op jouw vragen (flipped classroom)', icon: '🎬',
    color: '#b91c1c', category: 'test', hasSubmissions: true, hasScore: true, wide: true,
    defaultConfig: () => ({ videoUrl: '', checkpoints: [] }),
    Editor: lazyWidget(() => import('./videoquiz').then((m) => ({ default: m.VideoQuizEditor }))),
    Player: lazyWidget(() => import('./videoquiz').then((m) => ({ default: m.VideoQuizPlayer }))),
  },
  {
    id: 'splitwhiteboard', name: 'Gesplitst whiteboard', tagline: 'Bron bekijken en ernaast tekenen of noteren', icon: '🖌️',
    color: '#a21caf', category: 'test', hasSubmissions: true, hasScore: true, wide: true,
    defaultConfig: () => ({ source: { kind: 'text', text: '', title: '' }, prompt: '' }),
    Editor: lazyWidget(() => import('./splitwhiteboard').then((m) => ({ default: m.SplitWhiteboardEditor }))),
    Player: lazyWidget(() => import('./splitwhiteboard').then((m) => ({ default: m.SplitWhiteboardPlayer }))),
  },
  {
    id: 'jigsaw', name: 'Legpuzzel', tagline: 'Eigen afbeelding als schuifpuzzel', icon: '🧩',
    color: '#7c3aed', category: 'game', hasSubmissions: true, hasScore: false, wide: true,
    defaultConfig: () => ({ imageUrl: '', cols: 3, rows: 3 }),
    Editor: lazyWidget(() => import('./jigsaw').then((m) => ({ default: m.JigsawEditor }))),
    Player: lazyWidget(() => import('./jigsaw').then((m) => ({ default: m.JigsawPlayer }))),
  },
  {
    id: 'spotdifference', name: 'Zoek de verschillen', tagline: 'Twee afbeeldingen, verschillen aantikken', icon: '🔎',
    color: '#0d9488', category: 'game', hasSubmissions: true, hasScore: true, wide: true,
    defaultConfig: () => ({ imageA: '', imageB: '', differences: [] }),
    Editor: lazyWidget(() => import('./spotdifference').then((m) => ({ default: m.SpotDifferenceEditor }))),
    Player: lazyWidget(() => import('./spotdifference').then((m) => ({ default: m.SpotDifferencePlayer }))),
  },
  {
    id: 'carousel', name: 'Fotocarrousel', tagline: 'Diareeks met bijschriften', icon: '🎠',
    color: '#ea580c', category: 'picture', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ slides: [] }),
    Editor: lazyWidget(() => import('./carousel').then((m) => ({ default: m.CarouselEditor }))),
    Player: lazyWidget(() => import('./carousel').then((m) => ({ default: m.CarouselPlayer }))),
  },
  {
    id: 'imageviewer', name: 'Afbeeldingsviewer', tagline: 'Pannen en zoomen op een detailrijke afbeelding', icon: '🗺️',
    color: '#4d7c0f', category: 'picture', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({ imageUrl: '', description: '' }),
    Editor: lazyWidget(() => import('./imageviewer').then((m) => ({ default: m.ImageViewerEditor }))),
    Player: lazyWidget(() => import('./imageviewer').then((m) => ({ default: m.ImageViewerPlayer }))),
  },
  {
    id: 'beforeafter', name: 'Voor/na-vergelijker', tagline: 'Twee beelden vergelijken met een schuifregelaar', icon: '🔛',
    color: '#155e75', category: 'picture', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({ imageBefore: '', imageAfter: '', labelBefore: 'Voor', labelAfter: 'Na' }),
    Editor: lazyWidget(() => import('./beforeafter').then((m) => ({ default: m.BeforeAfterEditor }))),
    Player: lazyWidget(() => import('./beforeafter').then((m) => ({ default: m.BeforeAfterPlayer }))),
  },
  {
    id: 'framesequence', name: 'Framesequentie', tagline: 'Een proces stap voor stap in beeld', icon: '🎞️',
    color: '#6d28d9', category: 'picture', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ frames: [] }),
    Editor: lazyWidget(() => import('./framesequence').then((m) => ({ default: m.FrameSequenceEditor }))),
    Player: lazyWidget(() => import('./framesequence').then((m) => ({ default: m.FrameSequencePlayer }))),
  },
  {
    id: 'tiptiles', name: 'Tip-tegels', tagline: 'Klikbare tegels met uitleg per begrip', icon: '🀄',
    color: '#be185d', category: 'picture', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ tiles: [] }),
    Editor: lazyWidget(() => import('./tiptiles').then((m) => ({ default: m.TipTilesEditor }))),
    Player: lazyWidget(() => import('./tiptiles').then((m) => ({ default: m.TipTilesPlayer }))),
  },
  {
    id: 'randomimages', name: 'Willekeurige afbeeldingen', tagline: 'Creatieve beeldprikkel voor schrijf- en spreekopdrachten', icon: '🎲',
    color: '#c2410c', category: 'picture', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ images: [] }),
    Editor: lazyWidget(() => import('./randomimages').then((m) => ({ default: m.RandomImagesEditor }))),
    Player: lazyWidget(() => import('./randomimages').then((m) => ({ default: m.RandomImagesPlayer }))),
  },
  {
    id: 'mediaplayer', name: 'Videospeler', tagline: 'YouTube of Vimeo afgebakend insluiten', icon: '📺',
    color: '#475569', category: 'picture', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({ provider: 'youtube', videoUrl: '', title: '' }),
    Editor: lazyWidget(() => import('./mediaplayer').then((m) => ({ default: m.MediaPlayerEditor }))),
    Player: lazyWidget(() => import('./mediaplayer').then((m) => ({ default: m.MediaPlayerPlayer }))),
  },
  {
    id: 'activeplot', name: 'Actieve plot', tagline: 'Functiegrafieken met versleepbare parameters', icon: '📈',
    color: '#1d4ed8', category: 'math', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({
      functions: [{ id: uid(), expression: 'a*x^2 + b', color: '#4f46e5' }],
      params: [
        { name: 'a', min: -5, max: 5, step: 0.1, value: 1 },
        { name: 'b', min: -10, max: 10, step: 0.5, value: 0 },
      ],
      xMin: -10, xMax: 10, yMin: -10, yMax: 10,
    }),
    Editor: lazyWidget(() => import('./activeplot').then((m) => ({ default: m.ActivePlotEditor }))),
    Player: lazyWidget(() => import('./activeplot').then((m) => ({ default: m.ActivePlotPlayer }))),
  },
  {
    id: 'chart', name: 'Grafiek', tagline: 'Staaf, lijn of taart — leerlingen zien data veranderen', icon: '📊',
    color: '#15803d', category: 'math', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({ chartType: 'bar', title: '', labels: ['A', 'B', 'C'], values: [4, 7, 3], studentEditable: false }),
    Editor: lazyWidget(() => import('./chart').then((m) => ({ default: m.ChartEditor }))),
    Player: lazyWidget(() => import('./chart').then((m) => ({ default: m.ChartPlayer }))),
  },
  {
    id: 'webquest', name: 'WebQuest', tagline: 'Zelfstandige onderzoeksopdracht in stappen', icon: '🧭',
    color: '#9a3412', category: 'classroom', hasSubmissions: true, hasScore: false, wide: true,
    defaultConfig: () => ({ steps: [] }),
    Editor: lazyWidget(() => import('./webquest').then((m) => ({ default: m.WebquestEditor }))),
    Player: lazyWidget(() => import('./webquest').then((m) => ({ default: m.WebquestPlayer }))),
  },
  {
    id: 'mindmap', name: 'Mindmap', tagline: 'Begrippen structureren — bekijken of zelf bouwen', icon: '🕸️',
    color: '#0f766e', category: 'classroom', hasSubmissions: true, hasScore: false, wide: true,
    defaultConfig: () => ({ root: '', outline: '', studentEditable: false }),
    Editor: lazyWidget(() => import('./mindmap').then((m) => ({ default: m.MindmapEditor }))),
    Player: lazyWidget(() => import('./mindmap').then((m) => ({ default: m.MindmapPlayer }))),
  },
  {
    id: 'planner', name: 'Planner', tagline: 'Week- of stappenplan dat leerlingen afwerken', icon: '🗓️',
    color: '#3f6212', category: 'classroom', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ title: '', sections: [] }),
    Editor: lazyWidget(() => import('./planner').then((m) => ({ default: m.PlannerEditor }))),
    Player: lazyWidget(() => import('./planner').then((m) => ({ default: m.PlannerPlayer }))),
  },
  {
    id: 'piano', name: 'Piano', tagline: 'Speelbaar klavier voor de muziekles', icon: '🎹',
    color: '#1e293b', category: 'classroom', hasSubmissions: false, hasScore: false, wide: true,
    defaultConfig: () => ({ showNoteNames: true, octaves: 2 }),
    Editor: lazyWidget(() => import('./piano').then((m) => ({ default: m.PianoEditor }))),
    Player: lazyWidget(() => import('./piano').then((m) => ({ default: m.PianoPlayer }))),
  },
  {
    id: 'spinner', name: 'Rad van fortuin', tagline: 'Willekeurige leerling of opdracht kiezen', icon: '🎡',
    color: '#f59e0b', category: 'classroom', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ items: [], removeAfterSpin: true }),
    Editor: lazyWidget(() => import('./spinner').then((m) => ({ default: m.SpinnerEditor }))),
    Player: lazyWidget(() => import('./spinner').then((m) => ({ default: m.SpinnerPlayer }))),
  },
  {
    id: 'timer', name: 'Klastimer', tagline: 'Afteltimer met geluidssignaal', icon: '⏲️',
    color: '#475569', category: 'classroom', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ minutes: 5, seconds: 0, label: '', sound: true }),
    Editor: lazyWidget(() => import('./timer').then((m) => ({ default: m.TimerEditor }))),
    Player: lazyWidget(() => import('./timer').then((m) => ({ default: m.TimerPlayer }))),
  },
  {
    id: 'checklist', name: 'Checklist', tagline: 'Stappenplan dat leerlingen afvinken', icon: '✅',
    color: '#0f766e', category: 'classroom', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ items: [], title: '' }),
    Editor: lazyWidget(() => import('./checklist').then((m) => ({ default: m.ChecklistEditor }))),
    Player: lazyWidget(() => import('./checklist').then((m) => ({ default: m.ChecklistPlayer }))),
  },
];

export function getTypeDef(id: WidgetTypeId): WidgetTypeDef {
  const def = WIDGET_TYPES.find((t) => t.id === id);
  if (!def) throw new Error(`Onbekend widgettype: ${id}`);
  return def;
}

export function defaultSettings(): WidgetSettings {
  return {
    accentColor: '#4f46e5',
    shuffle: false,
    showFeedback: true,
    showScore: true,
    timeLimitMin: 0,
    maxAttempts: 0,
    requireName: true,
    instructions: '',
  };
}

export function createWidget(type: WidgetTypeId, title?: string): Widget {
  const def = getTypeDef(type);
  return {
    id: uid(),
    type,
    title: title ?? `Nieuwe ${def.name.toLowerCase()}`,
    folderId: null,
    config: def.defaultConfig(),
    settings: { ...defaultSettings(), accentColor: def.color },
    code: makeCode(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
