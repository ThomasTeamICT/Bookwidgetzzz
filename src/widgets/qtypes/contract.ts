// Contract voor uitgebreide vraagtypes — losgetrokken van index.tsx zodat de
// deelmodules (formTypes/interactTypes) geen importcyclus met de index vormen.

import type React from 'react';
import type { ItemScore, Question, QuestionType } from '../../lib/types';

export interface AnswerProps<Q extends Question = Question> {
  q: Q;
  value: unknown;
  onChange: (v: unknown) => void;
  /** true in het feedbackoverzicht na indienen (alleen-lezen + juist/fout tonen). */
  review: boolean;
}

export interface ExtraQType<Q extends Question = Question> {
  type: QuestionType;
  name: string;
  icon: string;
  desc: string;
  /** Nieuwe, lege vraag (id/points/prompt komen uit base). */
  make: (base: { id: string; prompt: string; points: number }) => Q;
  Editor: React.ComponentType<{ q: Q; onChange: (q: Q) => void }>;
  Answer: React.ComponentType<AnswerProps<Q>>;
  /** Autoscore; null = manueel beoordelen (pending voor de nakijkcockpit). */
  grade: (q: Q, answer: unknown) => ItemScore | null;
  /** Voorleestekst (naast de prompt). */
  tts?: (q: Q) => string[];
  /** Compacte samenvatting voor lijstjes (editor/print), bv. "3 categorieën · 8 items". */
  summary?: (q: Q) => string;
}
