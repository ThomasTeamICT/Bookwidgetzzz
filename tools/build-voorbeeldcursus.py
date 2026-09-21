#!/usr/bin/env python3
"""
Bouwt de voorbeeldcursus natuurwetenschappen (public/voorbeelden/…) uit
1. de cursus zoals de importpagina ze zelf maakt (14 pdf's → "Samenvoegen tot
   één cursus", sectieniveau 3), gedumpt als json, en
2. de oorspronkelijke pdf's, voor de afbeeldingen (PyMuPDF rendert elke
   afbeelding op de pagina en zet ze op de juiste plek in de sectie).

Daarbovenop: doelcodes per sectie (voorbeeldleerplan), flitskaarten uit elke
begrippenlijst, de handgeschreven oefeningen uit tools/oefeningen/h*.json
(zie SCHEMA.md daar) en de metadata van de cursus. De oefeningen die de
importpagina zelf afleidt (begrippenquiz, koppelspel, invuloefeningen,
werkblad met opdrachten) zitten al in de dump van stap 1. De pdf's zelf zitten niet in de
repo (materiaal van een leerkracht); dit script documenteert hoe het voorbeeld
tot stand kwam en maakt het herhaalbaar als de importpipeline verandert.

Gebruik:  python3 tools/build-voorbeeldcursus.py <cursus-raw.json> <map-met-pdfs>
"""
import glob, json, os, re, sys, time

import fitz  # PyMuPDF

RAW, PDFDIR = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, 'public', 'voorbeelden', 'natuurwetenschappen-1e-graad.json')
OUT_IMG = os.path.join(ROOT, 'public', 'voorbeelden', 'nw')
os.makedirs(OUT_IMG, exist_ok=True)
for f in glob.glob(os.path.join(OUT_IMG, '*.jpg')):
    os.remove(f)

CURRICULUM_ID = 'wf-voorbeeld-nw-1egraad'
COURSE_ID = 'nw-voorbeeld-1e-graad'
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def uid(prefix):
    uid.n += 1
    return f'{prefix}{uid.n:03d}'
uid.n = 0


def norm(t):
    return re.sub(r'[^a-z0-9]+', '', (t or '').lower().replace('**', ''))


def chapter_key(name):
    m = re.search(r'Hoofdstuk[_ ](\d+)([ab]?)', name)
    return (int(m.group(1)), m.group(2) or '') if m else (999, '')


# ── Doelcodes per hoofdstuk en per sectie (trefwoorden in de sectietitel) ──
GOALS = {
    (1, ''): (['NW 1.1', 'NW 1.5', 'NW 1.6'], [
        (r'onderzoeksvraag|hypothese', ['NW 1.5']), (r'benodigdheden|werkwijze|experiment', ['NW 1.1']),
        (r'waarneming', ['NW 1.2']), (r'besluit|reflect', ['NW 1.6']),
        (r'biotoop\?$|wat is een biotoop', ['NW 6.1']), (r'biotische factoren kenmerken', ['NW 6.1']),
        (r'determineren', ['NW 6.2']), (r'abiotische factoren meten', ['NW 6.2', 'NW 1.2'])]),
    (2, ''): (['NW 6.3', 'NW 6.4', 'NW 6.5'], [
        (r'voedsel', ['NW 6.3']), (r'aanpass|overleven', ['NW 6.4']), (r'biodiversiteit|mens|evenwicht', ['NW 6.5'])]),
    (3, ''): (['NW 2.1', 'NW 2.2', 'NW 2.3', 'NW 2.4'], [
        (r'deeltjes|molecul|opgebouwd', ['NW 2.3']), (r'toestand|aggregatie|vormen', ['NW 2.1']),
        (r'faseovergang|smelt|verdamp|stollen|condens', ['NW 2.2']), (r'chemisch|stofomzetting|fysisch|verander', ['NW 2.4']),
        (r'temperatuur|uitzet|volume', ['NW 2.3'])]),
    (4, ''): (['NW 5.11', 'NW 5.12', 'NW 5.13'], [
        (r'bouwsteentje|cellen opgebouwd|functioneert de cel', ['NW 5.11']), (r'doorsnede|macro- en micro|microscop', ['NW 5.13']),
        (r'weefsels|organen zich tot stelsels|organisatieniveaus', ['NW 5.12']), (r'zoogdier inwendig', ['NW 5.14', 'NW 5.12'])]),
    (5, ''): (['NW 5.1', 'NW 5.2'], [
        (r'weg|route|orga|mond|maag|darm', ['NW 5.1']), (r'gezond|voeding|voedingsstof|verter|enzym', ['NW 5.2'])]),
    (6, ''): (['NW 5.3'], []),
    (7, ''): (['NW 5.4'], []),
    (8, ''): (['NW 5.5'], []),
    (9, ''): (['NW 5.6'], []),
    (10, 'a'): (['NW 5.7'], []),
    (10, 'b'): (['NW 5.7', 'NW 5.8', 'NW 5.9'], [
        (r'puberteit|hormo', ['NW 5.8']), (r'bevrucht|zwanger|geboorte|baby', ['NW 5.9']), (r'voortplant', ['NW 5.7'])]),
    (11, ''): (['NW 3.2', 'NW 3.4', 'NW 3.5'], [
        (r'fotosynthese|plant|blad', ['NW 3.4']), (r'ademhaling|voedsel|verbrand', ['NW 3.5']), (r'zon|licht', ['NW 3.2']),
        (r'energiebron|energievorm|omzet', ['NW 3.1'])]),
    (12, ''): (['NW 7.1', 'NW 7.2', 'NW 7.3'], [
        (r'soorten|wat is een kracht|voorkom', ['NW 7.1']), (r'voorgesteld|pijl|meten', ['NW 7.2']), (r'snelheid', ['NW 7.3'])]),
    (13, ''): (['NW 2.5', 'NW 2.6'], [(r'drijf|zink', ['NW 2.6']), (r'massa|volume|dichtheid', ['NW 2.5'])]),
}
EMOJI = {(1, ''): '🔬', (2, ''): '🌿', (3, ''): '🧊', (4, ''): '🧫', (5, ''): '🍎', (6, ''): '🫁', (7, ''): '❤️', (8, ''): '💧',
         (9, ''): '🐟', (10, 'a'): '🌱', (10, 'b'): '👶', (11, ''): '☀️', (12, ''): '🧲', (13, ''): '⚖️'}


def goal_codes(key, section_title):
    default, rules = GOALS.get(key, ([], []))
    t = section_title.lower()
    if re.match(r'^(inleiding|mindmap|kernbegrippen)$', t.strip()):
        return list(default)
    codes = []
    for pat, cs in rules:
        if re.search(pat, t):
            for c in cs:
                if c not in codes:
                    codes.append(c)
    return codes or list(default)


# ── Afbeeldingen ────────────────────────────────────────────────────────────
def page_lines(page):
    """[(y0, y1, tekst)] van boven naar beneden."""
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            t = ''.join(sp['text'] for sp in l['spans']).strip()
            if t:
                out.append((l['bbox'][1], l['bbox'][3], t))
    out.sort()
    return out


def render_image(page, rect, path):
    scale = min(4.0, 1000.0 / max(rect.width, rect.height, 1))
    scale = max(scale, 1.0)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
    pix.save(path, output='jpg', jpg_quality=82)
    return os.path.getsize(path)


def chapter_images(doc, hn):
    """Afbeeldingen (≥ 60×60 pt, geen logo's die op elke pagina staan) met de
    tekstregel erboven, in leesvolgorde."""
    pages_per_xref = {}
    for pno in range(doc.page_count):
        for img in doc[pno].get_images(full=True):
            pages_per_xref.setdefault(img[0], set()).add(pno)
    found = []
    k = 0
    for pno in range(doc.page_count):
        page = doc[pno]
        lines = page_lines(page)
        rects = []
        for img in page.get_images(full=True):
            if len(pages_per_xref[img[0]]) >= 3:
                continue
            for r in page.get_image_rects(img[0]):
                if r.width < 60 or r.height < 60:
                    continue
                rects.append(r)
        rects.sort(key=lambda r: (round(r.y0), r.x0))
        for r in rects:
            above = [t for (y0, y1, t) in lines if y1 <= r.y0 + 3]
            if not above and pno > 0:
                prev = page_lines(doc[pno - 1])
                above = [t for (_, _, t) in prev]
            k += 1
            path = os.path.join(OUT_IMG, f'h{hn}-{k:02d}.jpg')
            size = render_image(page, r, path)
            found.append({'page': pno, 'y': r.y0, 'w': r.width,
                          'above': ' '.join(above[-3:]) if above else '', 'above1': above[-1] if above else '',
                          'url': f'voorbeelden/nw/{os.path.basename(path)}', 'bytes': size})
    return found


def locate_sections(doc, chapter):
    """Waar (pagina, y) begint elke sectie? Op de eerste regel die met de titel begint."""
    pos = []
    for si, sec in enumerate(chapter['sections']):
        key = norm(sec['title'])[:28]
        hit = None
        for pno in range(doc.page_count):
            for (y0, y1, t) in page_lines(doc[pno]):
                if key and norm(t).startswith(key[:min(len(key), 18)]):
                    hit = (pno, y0)
                    break
            if hit:
                break
        pos.append(hit)
    return pos


def block_text(b):
    if b['type'] == 'text':
        return b.get('markdown', '')
    if b['type'] in ('callout', 'quote'):
        return b.get('text', '')
    if b['type'] == 'heading':
        return b.get('text', '')
    if b['type'] == 'terms':
        return ' '.join(i['term'] + ' ' + i['uitleg'] for i in b['items'])
    if b['type'] == 'table':
        return ' '.join(' '.join(r) for r in b.get('rows', []))
    return ''


def find_anchor(sec, im):
    """Index waarna de afbeelding komt: het blok waarin de tekst vlak boven de
    afbeelding staat (eerst de laatste 40 tekens van de drie regels erboven,
    dan de laatste regel alleen); anders begin (boven de sectietitel stond
    niets) of einde van de sectie."""
    keys = [norm(im['above'])[-40:], norm(im['above1'])[-25:]]
    for key in keys:
        if len(key) < 8:
            continue
        for bi, b in enumerate(sec['blocks']):
            if key in norm(block_text(b)):
                return bi + 1
    k1 = norm(im['above1'])
    if k1 and norm(sec['title']).startswith(k1[:18]):
        return 0
    return len(sec['blocks'])


def insert_images(chapter, doc, hn):
    imgs = chapter_images(doc, hn)
    pos = locate_sections(doc, chapter)
    placed = 0
    last = {}  # sectie-id → (ankertekst, index van de laatst ingevoegde afbeelding)
    for im in imgs:
        # sectie: de laatste die vóór de afbeelding begint
        si_best = 0
        for si, p in enumerate(pos):
            if p and (p[0], p[1]) <= (im['page'], im['y'] + 1):
                si_best = si
        sec = chapter['sections'][si_best]
        block = {'id': uid('img'), 'type': 'image', 'url': im['url'],
                 'size': 'small' if im['w'] < 200 else ('wide' if im['w'] > 430 else 'normal')}
        prev = last.get(sec['id'])
        if prev and prev[0] == im['above']:
            at = prev[1] + 1  # naast elkaar op de pagina: na de vorige afbeelding
        else:
            at = find_anchor(sec, im)
        sec['blocks'].insert(at, block)
        last[sec['id']] = (im['above'], at)
        placed += 1
    return placed, sum(i['bytes'] for i in imgs)


# ── Flitskaarten uit de begrippenlijst ──────────────────────────────────────
def code_for(n):
    s = ''
    for _ in range(4):
        s = ALPHABET[n % len(ALPHABET)] + s
        n //= len(ALPHABET)
    return 'NW' + s


def flashcards_widget(chapter, hn, short):
    for sec in chapter['sections']:
        for bi, b in enumerate(sec['blocks']):
            if b['type'] == 'terms' and len(b['items']) >= 4:
                w = {
                    'id': f'nw-vb-flits-{hn}', 'type': 'flashcards',
                    'title': f'Flitskaarten — {short}', 'folderId': None,
                    'config': {'cards': [{'id': uid('fc'), 'front': i['term'], 'back': i['uitleg']} for i in b['items']], 'autoFlipSec': 0},
                    'settings': {}, 'code': code_for(int(hn.rstrip('ab')) * 7 + (1 if hn.endswith('b') else 0)),
                    'curriculumId': CURRICULUM_ID, 'createdAt': NOW, 'updatedAt': NOW,
                }
                sec['blocks'].insert(bi + 1, {'id': uid('wb'), 'type': 'widget', 'widgetId': w['id'],
                                              'note': 'Oefen de kernbegrippen met flitskaarten (gemaakt uit de begrippenlijst hierboven).'})
                return w
    return None



# ── Handgeschreven oefeningen (tools/oefeningen/h*.json) ────────────────────
OEF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'oefeningen')
QUIZ_LIKE = {'quiz': 'single', 'exitticket': 'single', 'worksheet': 'scroll'}


def convert_question(q, goal_code):
    t = q['type']
    out = {'id': uid('q'), 'type': t, 'prompt': q['prompt'], 'points': q.get('points', 2 if t == 'long' else (0 if t == 'info' else 1))}
    for k in ('explanation', 'hint'):
        if q.get(k):
            out[k] = q[k]
    if goal_code and t != 'info':
        out['goalCode'] = goal_code
    if t == 'mc':
        out.update(options=q['options'], correctIndex=q['correctIndex'])
    elif t == 'multi':
        out.update(options=q['options'], correctIndices=q['correctIndices'])
    elif t == 'tf':
        out['answer'] = bool(q['answer'])
    elif t == 'short':
        out.update(accepted=q['accepted'], caseSensitive=False)
    elif t == 'long':
        out['modelAnswer'] = q['modelAnswer']
        if q.get('rubric'):
            out['rubric'] = [{'criterion': r['criterion'], 'points': r['points']} for r in q['rubric']]
            out['points'] = sum(r['points'] for r in q['rubric']) or out['points']
        out['allowDraw'] = True
    elif t == 'gap':
        out['text'] = q['text']
    elif t == 'match':
        out['pairs'] = [{'left': p['left'], 'right': p['right']} for p in q['pairs']]
    elif t == 'order':
        out['items'] = list(q['items'])
    elif t == 'number':
        out.update(answer=q['answer'], tolerance=q.get('tolerance', 0))
    elif t == 'dropdown':
        out.update(text=q['text'], shuffle=bool(q.get('shuffle', True)))
    elif t == 'marktext':
        out.update(text=q['text'], penalizeWrong=bool(q.get('penalizeWrong', False)))
    elif t == 'sort':
        cats = [{'id': uid('cat'), 'name': c} for c in q['categories']]
        by_name = {c['name']: c['id'] for c in cats}
        out.update(categories=cats, items=[{'id': uid('it'), 'text': i['text'], 'categoryId': by_name[i['category']]} for i in q['items']])
    elif t == 'table':
        out.update(columns=q['columns'], rows=[{'id': uid('r'), 'cells': r['cells'], 'answers': r['answers']} for r in q['rows']], caseSensitive=False)
    return out


def convert_widget(o, hn, idx, goal_code):
    t = o['type']
    c = o['config']
    if t in QUIZ_LIKE:
        config = {'questions': [convert_question(q, goal_code) for q in c['questions']], 'layout': QUIZ_LIKE[t]}
        if t == 'quiz':
            config['stepCheck'] = True
    elif t == 'pairs':
        config = {'pairs': [{'id': uid('p'), 'left': p['left'], 'right': p['right']} for p in c['pairs']]}
    elif t == 'memory':
        config = {'pairs': [{'id': uid('m'), 'a': p['a'], 'b': p['b']} for p in c['pairs']]}
    elif t == 'scramble':
        config = {'mode': c['mode'], 'items': [{'id': uid('s'), 'text': i['text'], **({'hint': i['hint']} if i.get('hint') else {})} for i in c['items']]}
    elif t == 'hangman':
        config = {'words': [{'word': w['word'], 'hint': w['hint']} for w in c['words']], 'maxErrors': 8}
    elif t == 'wordsearch':
        config = {'words': [w.upper() for w in c['words']], 'size': max(12, max(len(w) for w in c['words'])), 'allowDiagonal': True, 'allowReverse': False}
    elif t == 'crossword':
        config = {'entries': [{'id': uid('c'), 'word': e['word'].upper(), 'clue': e['clue']} for e in c['entries']]}
    elif t == 'poll':
        config = {'question': c['question'], 'options': c['options'], 'allowMultiple': bool(c.get('allowMultiple', False)), 'showResults': True}
    elif t == 'checklist':
        config = {'title': c['title'], 'items': [{'id': uid('ck'), 'text': i} for i in c['items']]}
    else:
        raise ValueError(f'onbekend type {t}')
    return {
        'id': f'nw-vb-oef-{hn}-{idx:02d}', 'type': t, 'title': o['titel'], 'folderId': None,
        'config': config, 'settings': {}, 'code': code_for(9000 + int(hn.rstrip('ab')) * 40 + (20 if hn.endswith('b') else 0) + idx),
        'curriculumId': CURRICULUM_ID, 'createdAt': NOW, 'updatedAt': NOW,
    }


def add_authored(chapter, hn):
    path = os.path.join(OEF_DIR, f'h{hn}.json')
    if not os.path.exists(path):
        return []
    data = json.load(open(path, encoding='utf-8'))
    widgets = []
    for idx, o in enumerate(data['oefeningen'], 1):
        key = str(o['sectie']).strip().lower()
        sec = next((s for s in chapter['sections'] if s['title'].lower().startswith(key)), None)
        if sec is None:
            print(f'  ! h{hn}: sectie {o["sectie"]!r} niet gevonden voor {o["titel"]!r}')
            continue
        w = convert_widget(o, hn, idx, (sec.get('goalCodes') or [None])[0])
        widgets.append(w)
        block = {'id': uid('wb'), 'type': 'widget', 'widgetId': w['id'], 'note': o['toelichting']}
        if o.get('plaats') == 'begin':
            sec['blocks'].insert(0, block)
        else:
            sec['blocks'].append(block)
    return widgets

# ── Samenstellen ────────────────────────────────────────────────────────────
NOW = int(time.time() * 1000)
raw = json.load(open(RAW))
course = raw.get('course', raw)
pdfs = sorted(glob.glob(os.path.join(PDFDIR, '*Hoofdstuk*.pdf')), key=chapter_key)
# De oefeningen die de importpagina zelf afleidde reizen mee uit de dump.
widgets = []
for w in raw.get('widgets', []):
    w['curriculumId'] = CURRICULUM_ID
    widgets.append(w)
derived_n = len(widgets)
total_img = 0
total_bytes = 0
authored_n = 0
for ch in course['chapters']:
    key = chapter_key(ch['title'].replace('Hoofdstuk ', 'Hoofdstuk_'))
    pdf = next((p for p in pdfs if chapter_key(os.path.basename(p)) == key), None)
    hn = f'{key[0]:02d}{key[1]}'
    ch['emoji'] = EMOJI.get(key, '📘')
    for sec in ch['sections']:
        sec['goalCodes'] = goal_codes(key, sec['title'])
    if pdf:
        doc = fitz.open(pdf)
        n, b = insert_images(ch, doc, hn)
        total_img += n
        total_bytes += b
    short = re.sub(r'^Hoofdstuk \d+[ab]?:\s*', '', ch['title'])
    w = flashcards_widget(ch, hn, short)
    if w:
        widgets.append(w)
    authored = add_authored(ch, hn)
    widgets.extend(authored)
    authored_n += len(authored)
    print(f"{ch['title'][:46]:46} secties={len(ch['sections']):2} afb={n if pdf else 0:2} flits={'ja' if w else 'nee'} oefeningen={len(authored)}")

course.update({
    'id': COURSE_ID,
    'title': 'Natuurwetenschappen 1e graad — voorbeeldcursus',
    'subtitle': 'Bestaande cursus van een leerkracht: 14 pdf-hoofdstukken, via Materiaal → “Samenvoegen tot één cursus” ingelezen en daarna aangevuld met afbeeldingen, doelcodes en flitskaarten.',
    'author': 'Voorbeeldmateriaal',
    'coverEmoji': '🧪',
    'code': 'NWVBAA',
    'curriculumId': CURRICULUM_ID,
    'createdAt': NOW, 'updatedAt': NOW,
})
ids = {w['id'] for w in widgets}
missing = [b['widgetId'] for ch in course['chapters'] for s_ in ch['sections'] for b in s_['blocks'] if b['type'] == 'widget' and b['widgetId'] not in ids]
if missing:
    raise SystemExit(f'widgetblokken zonder widget: {missing[:5]}')
payload = {'app': 'boosterz', 'kind': 'cursus', 'v': 1, 'course': course, 'widgets': widgets}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
print(f'\n{OUT_JSON}: {os.path.getsize(OUT_JSON)//1024} kB, {total_img} afbeeldingen ({total_bytes//1024} kB), '
      f'{len(widgets)} widgets ({derived_n} afgeleid door de importpagina, {authored_n} handgeschreven, {len(widgets) - derived_n - authored_n} flitskaartensets)')
