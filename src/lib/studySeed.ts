// ── Eerste leerstofonderdeel: transformaties van het vlak ───────────────────
//
// Uitgeschreven vanuit het werkboek (NANDO 2 — Meetkunde, module 01) en de
// verbeterde oefeningen: de theorie, de notaties, de wiskundetaal en de
// fouten die in de verbetering opdoken. Bewust géén foto's van het werkboek
// in deze repo: die pagina's zijn van de uitgever en deze app staat publiek
// online. Foto's voeg je in de app zelf toe; die blijven op het toestel.
//
// De id's zijn vast (niet uid()): zo blijft de studievoortgang van een
// leerling geldig als deze module ooit bijgewerkt wordt.

import type { StudyTopic } from './studyTypes';
import { getTopics, saveTopic } from './study';

const SEED_FLAG = 'wf.study.seeded.v1';
export const SEED_TOPIC_ID = 'wf-leerstof-transformaties';

function q(n: number, vraag: string, antwoord: string, uitleg?: string, bron?: string) {
  return { id: `tf-v${n}`, vraag, antwoord, uitleg, bron };
}

export function transformatiesTopic(): StudyTopic {
  const now = Date.now();
  return {
    id: SEED_TOPIC_ID,
    leerling: 'Will',
    vak: 'Wiskunde',
    titel: 'Transformaties van het vlak en symmetrie',
    bron: 'NANDO 2 — Meetkunde, module 01 (die Keure)',
    emoji: '📐',
    kleur: '#4f46e5',
    // Datum vul je in de app in: dan telt het overzicht mee af.
    toetsDatum: undefined,

    doelen: [
      { id: 'tf-d1', tekst: 'Ik ken de vier transformaties: spiegeling om een as, translatie over een vector, rotatie rond een centrum over een hoek en spiegeling om een punt.' },
      { id: 'tf-d2', tekst: 'Ik kan bij een tekening of foto verklaren door welke transformatie het beeld ontstaat.' },
      { id: 'tf-d3', tekst: 'Ik kan de symbolen lezen én zelf schrijven: s_a(A) = A′, t_XY(A) = A′, r_(O,α)(P) = P′ en s_O(P) = P′.' },
      { id: 'tf-d4', tekst: 'Ik gebruik het juiste teken bij een rotatie: positief is tegenwijzerzin, negatief is wijzerzin.' },
      { id: 'tf-d5', tekst: 'Ik weet dat een figuur en haar beeld congruent zijn, en ik kan uitleggen wat een dekpunt is.' },
      { id: 'tf-d6', tekst: 'Ik kan een beeld tekenen: spiegelen om een as, verschuiven over een vector, roteren over 90° of 180°, en puntspiegelen.' },
      { id: 'tf-d7', tekst: 'Ik kan het centrum van een puntspiegeling vinden (het midden van [PP′]) en de vector van een translatie tekenen (van origineel naar beeld).' },
      { id: 'tf-d8', tekst: 'Ik kan de rotatiehoek berekenen bij n plaatsen rond een cirkel: 360° gedeeld door n.' },
      { id: 'tf-d9', tekst: 'Ik herken spiegelsymmetrie om een as (lijnsymmetrisch) en om een punt (puntsymmetrisch).' },
    ],

    secties: [
      {
        id: 'tf-s0',
        titel: '1 Transformaties van het vlak',
        markdown:
          'Een **transformatie** van het vlak beeldt **elk punt** van dat vlak af op **juist één** ander punt van dat vlak. Dat nieuwe punt heet het **beeld**; je schrijft er een accent bij: het beeld van A is A′.\n\n'
          + 'Dit schooljaar zie je vier manieren om een beeld te maken:\n'
          + '- het punt **spiegelen om een as**\n'
          + '- het punt **verschuiven over een vector** (translatie)\n'
          + '- het punt **roteren rond een centrum over een hoek**\n'
          + '- het punt **spiegelen om een punt** (puntspiegeling)',
      },
      {
        id: 'tf-s1',
        titel: '1.1 Spiegelen om een as',
        figuur: 'spiegeling',
        markdown:
          'Je spiegelt om een rechte: de **spiegelas**. Die noteer je met een **kleine letter**, bijvoorbeeld *a*.\n\n'
          + '**Onthoud:**\n'
          + '- De afstand van A tot de spiegelas is even groot als de afstand van A′ tot de spiegelas.\n'
          + '- De verbindingslijn tussen een punt en zijn beeld staat **loodrecht** op de as.\n'
          + '- Een punt dat **op** de spiegelas ligt, is zijn eigen beeld. Zo’n punt heet een **dekpunt**.\n'
          + '- Een figuur en haar spiegelbeeld zijn **congruent**: zelfde vorm, zelfde grootte.\n\n'
          + 'In symbolen: `s_a(A) = A′` en `s_a(ΔBCD) = ΔB′C′D′`.',
      },
      {
        id: 'tf-s2',
        titel: '1.2 Translatie over een vector',
        figuur: 'translatie',
        markdown:
          'Een **translatie** is een **verschuiving**. De vector legt drie dingen vast:\n'
          + '- de **richting**: evenwijdig met de drager van de vector\n'
          + '- de **zin**: de kant waar de pijl naartoe wijst\n'
          + '- de **grootte**: de afstand waarover je verschuift\n\n'
          + '**Onthoud:**\n'
          + '- |XY| = |AA′| = |BB′| = … en XY ∥ AA′ ∥ BB′ ∥ …\n'
          + '- XY = AA′ : dat zijn **gelijke vectoren**.\n'
          + '- XY ≠ YX : zelfde richting en grootte, maar andere zin. Dat zijn **tegengestelde vectoren**.\n'
          + '- Een figuur en haar beeld door een translatie zijn **congruent**.\n\n'
          + 'In symbolen: `t_XY(A) = A′` en `t_XY(ΔBCD) = ΔB′C′D′`.',
      },
      {
        id: 'tf-s3',
        titel: '1.3 Rotatie rond een centrum over een hoek',
        figuur: 'rotatie',
        markdown:
          'Bij een **rotatie** draai je rond een **centrum** (een punt, met een hoofdletter: O, M …) over een **hoek** α.\n\n'
          + '**De afspraak over het teken — hier gaan de meeste punten verloren:**\n'
          + '- α **positief** → **tegenwijzerzin**. Voorbeeld: `r_(O, 60°)` is 60° in tegenwijzerzin.\n'
          + '- α **negatief** → **wijzerzin**. Voorbeeld: `r_(O, −150°)` is 150° in wijzerzin.\n\n'
          + 'Kijk dus eerst welke kant je draait, en schrijf pas dan het teken op.\n\n'
          + '**Merk op:** `r_(O, −210°)(P) = r_(O, 150°)(P)`. Je komt op hetzelfde beeld uit, want −210° + 360° = 150°.\n\n'
          + 'De afstand van het centrum tot het punt blijft gelijk: |OP| = |OP′|.',
      },
      {
        id: 'tf-s4',
        titel: '1.4 Spiegeling om een punt (puntspiegeling)',
        figuur: 'puntspiegeling',
        markdown:
          'Je kan ook spiegelen **om een punt** O. In symbolen: `s_O(P) = P′`.\n\n'
          + '**Onthoud:** spiegelen om een punt O is **hetzelfde als roteren rond O over 180°**. Daarom heet dit ook een **puntspiegeling** met centrum O.\n\n'
          + 'Handig bij oefeningen: het centrum O ligt **precies in het midden** van [PP′]. Moet je het centrum zoeken? Verbind het punt met zijn beeld en neem het midden.',
      },
      {
        id: 'tf-s5',
        titel: '1.5 Andere transformaties',
        markdown:
          'De transformaties van dit hoofdstuk zijn bijzonder: het beeld van een vlakke figuur is **altijd congruent** met de oorspronkelijke figuur. Dat blijft zo als je er **meerdere na elkaar** uitvoert. Spiegel je een parallellogram eerst om een as en verschuif je het daarna over een vector, dan is het beeld opnieuw een congruent parallellogram.\n\n'
          + 'Er bestaan ook transformaties waarbij het beeld **niet** congruent is, bijvoorbeeld een **projectie** of een **homothetie** (vergroten of verkleinen).',
      },
      {
        id: 'tf-s6',
        titel: 'Symmetrie',
        todo: true,
        markdown:
          'Van deel 2 (eigenschappen van transformaties) en deel 3 (symmetrie) staat hier alleen de kern — vul aan uit het werkboek zodra je die bladzijden hebt.\n\n'
          + '- Een figuur is **spiegelsymmetrisch om een as** (of **lijnsymmetrisch**) als een spiegeling om die as de figuur precies op **zichzelf** afbeeldt. Die as heet dan een **symmetrieas**.\n'
          + '- Een figuur is **spiegelsymmetrisch om een punt** (of **puntsymmetrisch**) als een puntspiegeling om dat punt de figuur op zichzelf afbeeldt.\n'
          + '- Ook **ruimtefiguren** kan je op symmetrie onderzoeken (symmetrievlakken).',
      },
    ],

    notaties: [
      { id: 'tf-n1', symbool: 's_a', betekenis: 'een spiegeling om de as a (kleine letter voor een as)' },
      { id: 'tf-n2', symbool: 's_a(A) = A′', betekenis: 'A′ is het beeld van het punt A door een spiegeling om de as a' },
      { id: 'tf-n3', symbool: 's_a(ΔBCD) = ΔB′C′D′', betekenis: 'ΔB′C′D′ is het beeld van ΔBCD door een spiegeling om de as a' },
      { id: 'tf-n4', symbool: 'XY (met pijl)', betekenis: 'de vector XY — van X naar Y' },
      { id: 'tf-n5', symbool: 't_XY(A) = A′', betekenis: 'A′ is het beeld van A door een translatie over de vector XY' },
      { id: 'tf-n6', symbool: 'r_(O, α)', betekenis: 'een rotatie met centrum O over een hoek α' },
      { id: 'tf-n7', symbool: 'r_(O, 150°)(P) = P′', betekenis: 'P′ is het beeld van P door een rotatie rond O over 150° in tegenwijzerzin' },
      { id: 'tf-n8', symbool: 'r_(O, −105°)(DEFG) = D′E′F′G′', betekenis: 'D′E′F′G′ is het beeld van DEFG door een rotatie rond O over 105° in wijzerzin' },
      { id: 'tf-n9', symbool: 's_O', betekenis: 'een spiegeling om het punt O (hoofdletter voor een punt)' },
      { id: 'tf-n10', symbool: 's_O(P) = P′', betekenis: 'P′ is het beeld van het punt P door een spiegeling om het punt O' },
    ],

    begrippen: [
      { id: 'tf-b1', term: 'transformatie', uitleg: 'Elk punt van het vlak wordt afgebeeld op juist één ander punt van dat vlak.' },
      { id: 'tf-b2', term: 'beeld', uitleg: 'Het punt of de figuur die je na de transformatie krijgt; je noteert het met een accent (A′).' },
      { id: 'tf-b3', term: 'spiegelas', uitleg: 'De rechte waarover je spiegelt. Je noteert ze met een kleine letter, bv. a.' },
      { id: 'tf-b4', term: 'dekpunt', uitleg: 'Een punt dat zichzelf als beeld heeft, bv. elk punt dat op de spiegelas ligt.' },
      { id: 'tf-b5', term: 'congruente figuren', uitleg: 'Figuren met dezelfde vorm én dezelfde grootte.' },
      { id: 'tf-b6', term: 'vector', uitleg: 'Pijl die de richting, de zin en de grootte van een translatie vastlegt.' },
      { id: 'tf-b7', term: 'richting (van een vector)', uitleg: 'Evenwijdig met de drager van de vector.' },
      { id: 'tf-b8', term: 'zin (van een vector)', uitleg: 'De kant waar de pijl naartoe wijst.' },
      { id: 'tf-b9', term: 'gelijke vectoren', uitleg: 'Vectoren met dezelfde richting, zin én grootte, bv. XY = AA′.' },
      { id: 'tf-b10', term: 'tegengestelde vectoren', uitleg: 'Zelfde richting en grootte, maar tegengestelde zin, bv. XY en YX.' },
      { id: 'tf-b11', term: 'translatie', uitleg: 'Een verschuiving over een vector.' },
      { id: 'tf-b12', term: 'rotatie', uitleg: 'Een draaiing rond een centrum over een hoek.' },
      { id: 'tf-b13', term: 'centrum', uitleg: 'Het punt waarrond je draait of waarrond je puntspiegelt; noteer je met een hoofdletter.' },
      { id: 'tf-b14', term: 'tegenwijzerzin', uitleg: 'De draairichting bij een positieve hoek (+).' },
      { id: 'tf-b15', term: 'wijzerzin', uitleg: 'De draairichting bij een negatieve hoek (−), zoals de wijzers van een klok.' },
      { id: 'tf-b16', term: 'puntspiegeling', uitleg: 'Spiegeling om een punt; hetzelfde als een rotatie van 180° rond dat punt.' },
      { id: 'tf-b17', term: 'lijnsymmetrisch', uitleg: 'Een figuur die door een spiegeling om een as op zichzelf wordt afgebeeld.' },
      { id: 'tf-b18', term: 'puntsymmetrisch', uitleg: 'Een figuur die door een puntspiegeling op zichzelf wordt afgebeeld.' },
      { id: 'tf-b19', term: 'homothetie', uitleg: 'Een transformatie die vergroot of verkleint — het beeld is dan niet congruent.' },
    ],

    valkuilen: [
      { id: 'tf-p1', tekst: 'Zeg en schrijf “translatie **over** een vector”, niet “translatie van een vector”.' },
      { id: 'tf-p2', tekst: 'Teken van de hoek: + is tegenwijzerzin, − is wijzerzin. Kijk eerst welke kant je draait vóór je het teken opschrijft.' },
      { id: 'tf-p3', tekst: 'Bij n plaatsen rond een tafel is één plaats opschuiven 360°/n. Reken het product daarna juist uit: 3 × 45° = 135° (niet 121,5°).' },
      { id: 'tf-p4', tekst: 'Het centrum van een puntspiegeling ligt in het midden van [PP′]. Tel de hokjes en halveer — gok niet.' },
      { id: 'tf-p5', tekst: 'De translatievector loopt van het origineel naar het beeld. Is P het beeld van S, dan teken je de vector van S naar P.' },
      { id: 'tf-p6', tekst: 'Een as krijgt een kleine letter (a), een centrum een hoofdletter (O, M).' },
      { id: 'tf-p7', tekst: 'Vergeet de accenten niet: het beeld van ABCD is A′B′C′D′.' },
      { id: 'tf-p8', tekst: 'Vraagt de oefening om te noteren “in symbolen”, dan volstaat een woordelijk antwoord niet — schrijf s, t of r met centrum, as of vector erbij.' },
    ],

    vragen: [
      q(1, 'Wat is een transformatie van het vlak?', 'Een transformatie beeldt elk punt van het vlak af op juist één ander punt van dat vlak.'),
      q(2, 'Noem de vier transformaties uit dit hoofdstuk.', 'Spiegeling om een as, translatie over een vector, rotatie rond een centrum over een hoek, en spiegeling om een punt (puntspiegeling).'),
      q(3, 'Wat betekent s_a(A) = A′?', 'A′ is het beeld van het punt A door een spiegeling om de as a.'),
      q(4, 'Wat is een dekpunt? Geef een voorbeeld.', 'Een punt dat zichzelf als beeld heeft. Voorbeeld: elk punt dat op de spiegelas ligt.'),
      q(5, 'Welke drie dingen legt een vector vast?', 'De richting, de zin en de grootte van de translatie.'),
      q(6, 'Wat is het verschil tussen de vectoren XY en YX?', 'Ze hebben dezelfde richting en grootte, maar een tegengestelde zin: het zijn tegengestelde vectoren.'),
      q(7, 'In welke zin draai je bij r_(O, −90°)?', 'In wijzerzin, want de hoek is negatief.'),
      q(8, 'Waarom geeft r_(O, −210°)(P) hetzelfde beeld als r_(O, 150°)(P)?', 'Omdat −210° + 360° = 150°: je komt na die draai op precies hetzelfde punt uit.'),
      q(9, 'Een puntspiegeling om O is hetzelfde als welke rotatie?', 'Een rotatie rond O over 180°.'),
      q(10, 'Een puntspiegeling beeldt R af op S. Hoe vind je het centrum M?', 'M is het midden van het lijnstuk [RS]: verbind R met S en neem het midden.', undefined, 'oef. 4b, blz. 9'),
      q(11, 'Je moet een vector tekenen zodat P het beeld is van S. Van waar naar waar wijst de pijl?', 'Van S naar P — altijd van het origineel naar het beeld.', undefined, 'oef. 4c, blz. 9'),
      q(12, 'Aan een ronde tafel met 5 stoelen: over welke hoek draai je van de ene stoel naar de volgende?', '360° : 5 = 72°', undefined, 'oef. 6a, blz. 9'),
      q(13, 'Aan een ronde tafel met 8 stoelen: over welke hoek draai je als je 3 plaatsen opschuift?', '360° : 8 = 45° per plaats, dus 3 × 45° = 135°.', 'Let op: 3 × 45 is 135, niet 121,5. Reken het even na op papier.', 'oef. 6a, blz. 9'),
      q(14, 'Aan een ronde tafel met 3 stoelen draai je in wijzerzin van stoel A naar stoel B. Wat is α?', '360° : 3 = 120°, en in wijzerzin, dus α = −120°.', undefined, 'oef. 6a, blz. 9'),
      q(15, 'Zijn een figuur en haar beeld na een translatie congruent?', 'Ja. Alle transformaties uit dit hoofdstuk geven een congruent beeld — ook als je er meerdere na elkaar uitvoert.'),
      q(16, 'Noem een transformatie waarbij het beeld níet congruent is.', 'Een homothetie (vergroten of verkleinen) of een projectie.'),
      q(17, 'Noteer in symbolen: T is het beeld van P door een spiegeling om de y-as.', 's_(y-as)(P) = T', undefined, 'oef. 3l, blz. 8'),
      q(18, 'Noteer in symbolen: N is het beeld van S door een rotatie rond het centrum O over 90° in wijzerzin.', 'r_(O, −90°)(S) = N', 'Wijzerzin, dus de hoek krijgt een minteken.', 'oef. 3l, blz. 8'),
      q(19, 'Welke transformatie zie je in een waaier die opengaat?', 'Een rotatie rond een centrum over een hoek.', undefined, 'oef. 1b, blz. 7'),
      q(20, 'Welke transformatie zit er in het logo van Airbnb?', 'Een spiegeling om een (verticale) as.', undefined, 'oef. 1c, blz. 7'),
      q(21, 'Een schaakstuk schuift in een rechte lijn diagonaal over het bord. Welke transformatie is dat?', 'Een translatie over een vector.', undefined, 'oef. 1d, blz. 7'),
      q(22, 'Hoe controleer je of twee figuren elkaars beeld zijn door een spiegeling om een as?', 'Verbind elk punt met zijn beeld: die verbindingslijnen staan loodrecht op de as en het punt ligt even ver van de as als zijn beeld. De figuur is ook omgekeerd (spiegelbeeld).'),
      q(23, 'Hoe herken je dat twee figuren elkaars beeld zijn door een puntspiegeling en niet door een translatie?', 'Bij een puntspiegeling staat het beeld ondersteboven (180° gedraaid) en gaan alle verbindingslijnen door één punt: het centrum. Bij een translatie blijft de stand gelijk en zijn de verbindingspijlen evenwijdig.', 'Opgelet bij figuren die zelf puntsymmetrisch zijn (bv. een regelmatige zeshoek): dan kan het beeld er hetzelfde uitzien. Controleer dan of het centrum echt het midden is van elk punt en zijn beeld.', 'oef. 5, blz. 9'),
      q(24, 'Wanneer is een figuur lijnsymmetrisch?', 'Als je ze met een spiegeling om een as precies op zichzelf kan afbeelden. Die as heet de symmetrieas.'),
    ],

    fotos: [],
    notitie:
      'Nog te doen: oefening 3l (blz. 8) staat nog niet ingevuld — noteer die twee opgaven in symbolen. '
      + 'Van deel 2 (eigenschappen van transformaties) en deel 3 (symmetrie) ontbreken de bladzijden nog: '
      + 'voeg ze toe met een foto en vul de samenvatting aan. Vergeet de toetsdatum niet in te vullen.',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Zet het onderdeel klaar bij het eerste bezoek aan de leerstofpagina.
 * Eén keer: wie het verwijdert, krijgt het niet opnieuw voorgeschoteld.
 */
export function seedStudyIfEmpty() {
  try {
    if (localStorage.getItem(SEED_FLAG) === '1') return;
    localStorage.setItem(SEED_FLAG, '1');
  } catch {
    // Zonder localStorage heeft bewaren toch geen zin.
    return;
  }
  if (getTopics().length > 0) return;
  saveTopic(transformatiesTopic());
}
