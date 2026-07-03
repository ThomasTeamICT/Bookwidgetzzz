import type { Widget, WidgetTypeId } from './types';
import { createWidget } from '../widgets/registry';
import { uid } from './utils';

export interface Template {
  id: string;
  icon: string;
  name: string;
  description: string;
  type: WidgetTypeId;
  build: () => Widget;
}

/**
 * Didactisch doordachte startsjablonen: lesdoel-eerst in plaats van leeg canvas.
 * Placeholders tussen [vierkante haken] vult de leerkracht zelf in.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'exit-321',
    icon: '🎟️',
    name: '3-2-1 exit-ticket',
    description: 'Reflectie op het einde van de les: 3 geleerd, 2 vragen, 1 toepassing. Zonder punten.',
    type: 'exitticket',
    build: () => {
      const w = createWidget('exitticket', '3-2-1 exit-ticket: [LES/ONDERWERP]');
      w.settings.showScore = false;
      w.settings.instructions = 'Geen punten — dit helpt je leerkracht om de volgende les beter af te stemmen.';
      w.config = {
        layout: 'single',
        questions: [
          { id: uid(), type: 'long', prompt: 'Noem 3 dingen die je vandaag geleerd hebt.', points: 0, modelAnswer: '' },
          { id: uid(), type: 'long', prompt: 'Schrijf 2 vragen die je nog hebt.', points: 0, modelAnswer: '' },
          { id: uid(), type: 'long', prompt: 'Geef 1 voorbeeld van hoe je dit buiten de les kan gebruiken.', points: 0, modelAnswer: '' },
        ],
      };
      return w;
    },
  },
  {
    id: 'exit-troebel',
    icon: '🌫️',
    name: 'Troebelste punt',
    description: 'Snelle check: wat is nog onduidelijk? Eén open vraag plus zelfinschatting.',
    type: 'exitticket',
    build: () => {
      const w = createWidget('exitticket', 'Troebelste punt: [LES/ONDERWERP]');
      w.settings.showScore = false;
      w.config = {
        layout: 'single',
        questions: [
          { id: uid(), type: 'slider', prompt: 'Hoe goed snap je de leerstof van vandaag?', points: 0, min: 1, max: 10, step: 1, answer: 10, tolerance: 9, explanation: '' },
          { id: uid(), type: 'long', prompt: 'Wat is voor jou het “troebelste punt” — het stukje dat nog het minst duidelijk is?', points: 0, modelAnswer: '' },
        ],
      };
      return w;
    },
  },
  {
    id: 'diagnose',
    icon: '🩺',
    name: 'Diagnostische instap',
    description: 'Voorkennis peilen mét zekerheidsgraad — zo zie je misvattingen vóór je de les start.',
    type: 'quiz',
    build: () => {
      const w = createWidget('quiz', 'Instaptoets: [ONDERWERP]');
      w.settings.showScore = false;
      w.settings.showFeedback = false;
      w.settings.instructions = 'Dit is geen toets voor punten — het toont je leerkracht wat je al kent, zodat de les daarop verder bouwt. Gokken mag, zeg wel eerlijk hoe zeker je bent!';
      w.config = {
        layout: 'single',
        askConfidence: true,
        questions: [
          { id: uid(), type: 'mc', prompt: '[VOORKENNISVRAAG 1 — kies een vraag die een bekende misvatting blootlegt]', points: 1, options: ['[juiste antwoord]', '[typische misvatting]', '[afleider]'], correctIndex: 0, goal: '[LEERDOEL 1]' },
          { id: uid(), type: 'tf', prompt: '[STELLING die vaak fout wordt ingeschat]', points: 1, answer: true, goal: '[LEERDOEL 1]' },
          { id: uid(), type: 'short', prompt: '[VRAAG met kort antwoord]', points: 1, accepted: ['[antwoord]'], caseSensitive: false, goal: '[LEERDOEL 2]' },
        ],
      };
      return w;
    },
  },
  {
    id: 'herhaal-pool',
    icon: '🔁',
    name: 'Herhalingsquiz met vragenpool',
    description: 'Grote vragenpool, elke leerling krijgt een eigen trekking — ideaal om te herhalen zonder afkijken.',
    type: 'quiz',
    build: () => {
      const w = createWidget('quiz', 'Herhaling: [HOOFDSTUK]');
      w.config = {
        layout: 'single',
        drawCount: 5,
        stepCheck: true,
        questions: Array.from({ length: 8 }, (_, i) => ({
          id: uid(), type: 'mc' as const, prompt: `[HERHAALVRAAG ${i + 1}]`, points: 1,
          options: ['[juist]', '[fout]', '[fout]'], correctIndex: 0,
          hint: '[HINT: verwijs naar de strategie, niet naar het antwoord]',
          explanation: '[UITLEG waarom dit het juiste antwoord is]',
        })),
      };
      return w;
    },
  },
  {
    id: 'woordenschat',
    icon: '🃏',
    name: 'Woordenschat-flitskaarten',
    description: 'Flitskaartenset met Leitner-herhaling: lastige woorden komen vanzelf vaker terug.',
    type: 'flashcards',
    build: () => {
      const w = createWidget('flashcards', 'Woordenschat: [THEMA]');
      w.settings.shuffle = true;
      w.config = {
        autoFlipSec: 0,
        cards: Array.from({ length: 6 }, (_, i) => ({ id: uid(), front: `[WOORD ${i + 1}]`, back: `[VERTALING/BETEKENIS ${i + 1}]` })),
      };
      return w;
    },
  },
  {
    id: 'practicum',
    icon: '🧪',
    name: 'Stappenplan practicum',
    description: 'Checklist die leerlingen afvinken tijdens een proef of werkstuk — structuur voor executieve functies.',
    type: 'checklist',
    build: () => {
      const w = createWidget('checklist', 'Stappenplan: [PRACTICUM/OPDRACHT]');
      w.config = {
        title: '[TITEL VAN DE PROEF]',
        items: [
          'Lees de volledige opdracht vóór je begint',
          '[STAP 1: materiaal verzamelen]',
          '[STAP 2: …]',
          '[STAP 3: …]',
          'Controleer je resultaat en ruim je werkplek op',
        ].map((text) => ({ id: uid(), text })),
      };
      return w;
    },
  },
];
