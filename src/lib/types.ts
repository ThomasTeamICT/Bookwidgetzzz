// ── Kern-datamodellen van WidgetFabriek ─────────────────────────────────────

export type WidgetTypeId =
  | 'quiz'
  | 'worksheet'
  | 'exitticket'
  | 'flashcards'
  | 'crossword'
  | 'wordsearch'
  | 'memory'
  | 'hangman'
  | 'pairs'
  | 'timeline'
  | 'hotspot'
  | 'whiteboard'
  | 'spinner'
  | 'bingo'
  | 'arithmetic'
  | 'dictation'
  | 'poll'
  | 'checklist'
  | 'timer'
  | 'scramble';

export type WidgetCategory = 'test' | 'game' | 'picture' | 'math' | 'classroom';

/** Gedeelde instellingen die voor (bijna) elke widget gelden. */
export interface WidgetSettings {
  /** Kleuraccent van de widget in spelersweergave. */
  accentColor: string;
  /** Vragen/kaarten in willekeurige volgorde tonen. */
  shuffle: boolean;
  /** Feedback (juiste antwoorden) tonen na indienen. */
  showFeedback: boolean;
  /** Score tonen aan de leerling na indienen. */
  showScore: boolean;
  /** Tijdslimiet in minuten (0 = geen). */
  timeLimitMin: number;
  /** Maximaal aantal pogingen (0 = onbeperkt). */
  maxAttempts: number;
  /** Naam van de leerling verplicht vóór start. */
  requireName: boolean;
  /** Instructietekst die vóór het starten getoond wordt. */
  instructions: string;
}

export interface Widget<TConfig = unknown> {
  id: string;
  type: WidgetTypeId;
  title: string;
  folderId: string | null;
  config: TConfig;
  settings: WidgetSettings;
  /** Korte deelcode, bv. "K7P2QD". */
  code: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface ItemScore {
  earned: number;
  max: number;
  /** 'auto' = automatisch beoordeeld, 'manual' = door leerkracht, 'pending' = wacht op leerkracht */
  mode: 'auto' | 'manual' | 'pending';
  comment?: string;
}

export interface Submission {
  id: string;
  widgetId: string;
  widgetCode: string;
  studentName: string;
  startedAt: number;
  submittedAt: number;
  durationSec: number;
  /** Antwoorden per item-id; vorm is widget-specifiek. */
  answers: Record<string, unknown>;
  /** Score per item-id; null voor widgets zonder score. */
  itemScores: Record<string, ItemScore> | null;
  totalEarned: number;
  totalMax: number;
  status: 'submitted' | 'graded';
  teacherFeedback?: string;
}

// ── Quiz / werkblad / exitticket ────────────────────────────────────────────

export type QuestionType =
  | 'mc'        // meerkeuze, één juist
  | 'multi'     // meerkeuze, meerdere juist
  | 'tf'        // juist/onjuist
  | 'short'     // kort antwoord (tekst)
  | 'long'      // open vraag (lang, manueel beoordeeld)
  | 'gap'       // invuloefening (gaten in tekst)
  | 'match'     // koppelparen
  | 'order'     // rangschikken
  | 'number'    // numeriek antwoord
  | 'slider'    // schaal/schuiver
  | 'info';     // infoblok (geen vraag)

export interface QuestionBase {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Afbeelding als data-URL of extern adres. */
  imageUrl?: string;
  points: number;
  /** Uitleg die bij feedback getoond wordt. */
  explanation?: string;
}

export interface MCQuestion extends QuestionBase {
  type: 'mc';
  options: string[];
  correctIndex: number;
}
export interface MultiQuestion extends QuestionBase {
  type: 'multi';
  options: string[];
  correctIndices: number[];
}
export interface TFQuestion extends QuestionBase {
  type: 'tf';
  answer: boolean;
}
export interface ShortQuestion extends QuestionBase {
  type: 'short';
  /** Meerdere juiste antwoorden toegelaten. */
  accepted: string[];
  caseSensitive: boolean;
}
export interface LongQuestion extends QuestionBase {
  type: 'long';
  /** Verwachte modelantwoord (alleen voor de leerkracht). */
  modelAnswer?: string;
}
export interface GapQuestion extends QuestionBase {
  type: 'gap';
  /** Tekst met gaten tussen [vierkante haken], bv. "De hoofdstad van Frankrijk is [Parijs]." */
  text: string;
}
export interface MatchQuestion extends QuestionBase {
  type: 'match';
  pairs: { left: string; right: string }[];
}
export interface OrderQuestion extends QuestionBase {
  type: 'order';
  /** Items in de juiste volgorde. */
  items: string[];
}
export interface NumberQuestion extends QuestionBase {
  type: 'number';
  answer: number;
  tolerance: number;
}
export interface SliderQuestion extends QuestionBase {
  type: 'slider';
  min: number;
  max: number;
  step: number;
  answer: number;
  /** Marge waarbinnen het antwoord juist gerekend wordt. */
  tolerance: number;
}
export interface InfoBlock extends QuestionBase {
  type: 'info';
}

export type Question =
  | MCQuestion | MultiQuestion | TFQuestion | ShortQuestion | LongQuestion
  | GapQuestion | MatchQuestion | OrderQuestion | NumberQuestion
  | SliderQuestion | InfoBlock;

export interface QuizConfig {
  questions: Question[];
  /** 'single' = één vraag per scherm, 'scroll' = alles onder elkaar. */
  layout: 'single' | 'scroll';
}

// ── Overige widget-configuraties ────────────────────────────────────────────

export interface Flashcard { id: string; front: string; back: string; frontImage?: string; backImage?: string }
export interface FlashcardsConfig { cards: Flashcard[]; autoFlipSec: number }

export interface CrosswordEntry { id: string; word: string; clue: string }
export interface CrosswordConfig { entries: CrosswordEntry[] }

export interface WordsearchConfig { words: string[]; size: number; allowDiagonal: boolean; allowReverse: boolean }

export interface MemoryPair { id: string; a: string; b: string; aImage?: string; bImage?: string }
export interface MemoryConfig { pairs: MemoryPair[] }

export interface HangmanConfig { words: { word: string; hint: string }[]; maxErrors: number }

export interface PairsConfig { pairs: { id: string; left: string; right: string }[] }

export interface TimelineEvent { id: string; date: string; title: string; description?: string; imageUrl?: string }
export interface TimelineConfig { events: TimelineEvent[]; mode: 'view' | 'exercise' }

export interface HotspotPoint { id: string; x: number; y: number; label: string; description?: string }
export interface HotspotConfig { imageUrl: string; hotspots: HotspotPoint[]; mode: 'explore' | 'quiz' }

export interface WhiteboardConfig { backgroundImageUrl?: string; prompt: string }

export interface SpinnerConfig { items: string[]; removeAfterSpin: boolean }

export interface BingoConfig { items: string[]; size: 3 | 4 | 5; freeCenter: boolean }

export type ArithmeticOp = 'add' | 'sub' | 'mul' | 'div';
export interface ArithmeticConfig {
  ops: ArithmeticOp[];
  min: number;
  max: number;
  count: number;
  /** Tafels-modus: vermenigvuldigen met vaste tafels. */
  tables: number[];
}

export interface DictationConfig {
  sentences: { id: string; text: string; hint?: string }[];
  lang: string;
  rate: number;
}

export interface PollConfig {
  question: string;
  options: string[];
  allowMultiple: boolean;
  showResults: boolean;
}

export interface ChecklistConfig { items: { id: string; text: string }[]; title: string }

export interface TimerConfig { minutes: number; seconds: number; label: string; sound: boolean }

export interface ScrambleConfig {
  mode: 'word' | 'sentence';
  items: { id: string; text: string; hint?: string }[];
}

export interface WorksheetConfig extends QuizConfig {}
export interface ExitTicketConfig extends QuizConfig {}
