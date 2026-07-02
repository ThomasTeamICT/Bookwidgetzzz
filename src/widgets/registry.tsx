import type React from 'react';
import type { Widget, WidgetCategory, WidgetSettings, WidgetTypeId } from '../lib/types';
import { makeCode, uid } from '../lib/utils';
import type { EditorProps, PlayerProps } from './shared';

import { QuizEditor, QuizPlayer } from './quiz';
import { FlashcardsEditor, FlashcardsPlayer } from './flashcards';
import { CrosswordEditor, CrosswordPlayer } from './crossword';
import { WordsearchEditor, WordsearchPlayer } from './wordsearch';
import { MemoryEditor, MemoryPlayer } from './memory';
import { HangmanEditor, HangmanPlayer } from './hangman';
import { PairsEditor, PairsPlayer } from './pairs';
import { ScrambleEditor, ScramblePlayer } from './scramble';
import { BingoEditor, BingoPlayer } from './bingo';
import { SpinnerEditor, SpinnerPlayer } from './spinner';
import { TimerEditor, TimerPlayer } from './timer';
import { ChecklistEditor, ChecklistPlayer } from './checklist';
import { PollEditor, PollPlayer } from './poll';
import { DictationEditor, DictationPlayer } from './dictation';
import { ArithmeticEditor, ArithmeticPlayer } from './arithmetic';
import { TimelineEditor, TimelinePlayer } from './timeline';
import { HotspotEditor, HotspotPlayer } from './hotspot';
import { WhiteboardEditor, WhiteboardPlayer } from './whiteboard';

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
    Editor: QuizEditor, Player: QuizPlayer,
  },
  {
    id: 'worksheet', name: 'Werkblad', tagline: 'Oefenblad met vragen en infoblokken onder elkaar', icon: '📄',
    color: '#0891b2', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ questions: [], layout: 'scroll' }),
    Editor: QuizEditor, Player: QuizPlayer,
  },
  {
    id: 'exitticket', name: 'Exit-ticket', tagline: 'Korte check aan het einde van de les', icon: '🎟️',
    color: '#e11d48', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ questions: [], layout: 'single' }),
    Editor: QuizEditor, Player: QuizPlayer,
  },
  {
    id: 'dictation', name: 'Dictee', tagline: 'Zinnen beluisteren en typen (spraakstem)', icon: '🔊',
    color: '#7c3aed', category: 'test', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ sentences: [], lang: 'nl-BE', rate: 0.85 }),
    Editor: DictationEditor, Player: DictationPlayer,
  },
  {
    id: 'poll', name: 'Peiling', tagline: 'Stemmen en meningen verzamelen', icon: '🗳️',
    color: '#0d9488', category: 'test', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ question: '', options: ['', ''], allowMultiple: false, showResults: true }),
    Editor: PollEditor, Player: PollPlayer,
  },
  {
    id: 'flashcards', name: 'Flitskaarten', tagline: 'Studeerkaarten met voor- en achterkant', icon: '🃏',
    color: '#d97706', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ cards: [], autoFlipSec: 0 }),
    Editor: FlashcardsEditor, Player: FlashcardsPlayer,
  },
  {
    id: 'crossword', name: 'Kruiswoordraadsel', tagline: 'Automatisch gegenereerd rooster', icon: '✏️',
    color: '#4338ca', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ entries: [] }),
    Editor: CrosswordEditor, Player: CrosswordPlayer,
  },
  {
    id: 'wordsearch', name: 'Woordzoeker', tagline: 'Woorden zoeken in een letterrooster', icon: '🔍',
    color: '#059669', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ words: [], size: 12, allowDiagonal: true, allowReverse: false }),
    Editor: WordsearchEditor, Player: WordsearchPlayer,
  },
  {
    id: 'memory', name: 'Memory', tagline: 'Paren zoeken met omgedraaide kaarten', icon: '🧠',
    color: '#db2777', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ pairs: [] }),
    Editor: MemoryEditor, Player: MemoryPlayer,
  },
  {
    id: 'hangman', name: 'Galgje', tagline: 'Woorden raden, letter per letter', icon: '🎈',
    color: '#ea580c', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ words: [], maxErrors: 8 }),
    Editor: HangmanEditor, Player: HangmanPlayer,
  },
  {
    id: 'pairs', name: 'Koppelspel', tagline: 'Items uit twee kolommen bij elkaar zoeken', icon: '🔗',
    color: '#2563eb', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ pairs: [{ id: uid(), left: '', right: '' }, { id: uid(), left: '', right: '' }] }),
    Editor: PairsEditor, Player: PairsPlayer,
  },
  {
    id: 'scramble', name: 'Husselwoorden', tagline: 'Letters of zinnen in de juiste volgorde zetten', icon: '🔀',
    color: '#9333ea', category: 'game', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ mode: 'word', items: [] }),
    Editor: ScrambleEditor, Player: ScramblePlayer,
  },
  {
    id: 'bingo', name: 'Bingo', tagline: 'Willekeurige bingokaart per leerling', icon: '🎱',
    color: '#dc2626', category: 'game', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ items: [], size: 4, freeCenter: true }),
    Editor: BingoEditor, Player: BingoPlayer,
  },
  {
    id: 'timeline', name: 'Tijdlijn', tagline: 'Gebeurtenissen bekijken of rangschikken', icon: '📅',
    color: '#0284c7', category: 'picture', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ events: [], mode: 'view' }),
    Editor: TimelineEditor, Player: TimelinePlayer,
  },
  {
    id: 'hotspot', name: 'Hotspot-afbeelding', tagline: 'Punten op een afbeelding verkennen of aanwijzen', icon: '📍',
    color: '#65a30d', category: 'picture', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ imageUrl: '', hotspots: [], mode: 'explore' }),
    Editor: HotspotEditor, Player: HotspotPlayer,
  },
  {
    id: 'whiteboard', name: 'Whiteboard', tagline: 'Tekenopdracht — tekening komt bij de resultaten', icon: '🎨',
    color: '#c026d3', category: 'picture', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ prompt: '', backgroundImageUrl: undefined }),
    Editor: WhiteboardEditor, Player: WhiteboardPlayer,
  },
  {
    id: 'arithmetic', name: 'Rekenoefening', tagline: 'Automatisch gegenereerde sommen en tafels', icon: '🧮',
    color: '#16a34a', category: 'math', hasSubmissions: true, hasScore: true,
    defaultConfig: () => ({ ops: ['add', 'sub'], min: 1, max: 20, count: 10, tables: [] }),
    Editor: ArithmeticEditor, Player: ArithmeticPlayer,
  },
  {
    id: 'spinner', name: 'Rad van fortuin', tagline: 'Willekeurige leerling of opdracht kiezen', icon: '🎡',
    color: '#f59e0b', category: 'classroom', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ items: [], removeAfterSpin: true }),
    Editor: SpinnerEditor, Player: SpinnerPlayer,
  },
  {
    id: 'timer', name: 'Klastimer', tagline: 'Afteltimer met geluidssignaal', icon: '⏲️',
    color: '#475569', category: 'classroom', hasSubmissions: false, hasScore: false,
    defaultConfig: () => ({ minutes: 5, seconds: 0, label: '', sound: true }),
    Editor: TimerEditor, Player: TimerPlayer,
  },
  {
    id: 'checklist', name: 'Checklist', tagline: 'Stappenplan dat leerlingen afvinken', icon: '✅',
    color: '#0f766e', category: 'classroom', hasSubmissions: true, hasScore: false,
    defaultConfig: () => ({ items: [], title: '' }),
    Editor: ChecklistEditor, Player: ChecklistPlayer,
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
