// ── Uitgebreide vraagtypes: inplugbaar contract ─────────────────────────────
//
// De quiz-motor (quiz.tsx + lib/grading.ts) kent elf kerntypes; alles daarbuiten
// haakt hier in. Eén registratie per type levert: paletmetadata, een lege vraag,
// een editorformulier, de leerlinginteractie en (waar mogelijk) autoscoring.
// grade → null betekent "manueel beoordelen" (komt in de nakijkcockpit terecht).

import type { QuestionType } from '../../lib/types';
import type { ExtraQType } from './contract';
import { FORM_QTYPES } from './formTypes';
import { INTERACT_QTYPES } from './interactTypes';

export type { AnswerProps, ExtraQType } from './contract';

export const EXTRA_QTYPES: Partial<Record<QuestionType, ExtraQType<any>>> = {
  ...FORM_QTYPES,
  ...INTERACT_QTYPES,
};

export function extraQType(type: QuestionType): ExtraQType<any> | undefined {
  return EXTRA_QTYPES[type];
}
