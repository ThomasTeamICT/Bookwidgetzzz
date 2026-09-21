#!/usr/bin/env python3
"""
Bouwt de voorbeeldcursus natuurwetenschappen (public/voorbeelden/…) uit
1. de cursus zoals de importpagina ze zelf maakt (13 pdf's → "Samenvoegen tot
   één cursus", sectieniveau 3), gedumpt als json, en
2. de oorspronkelijke pdf's, voor de afbeeldingen (PyMuPDF rendert elke
   afbeelding op de pagina en zet ze op de juiste plek in de sectie).

Daarbovenop: doelcodes per sectie (voorbeeldleerplan), flitskaarten uit elke
begrippenlijst, en de metadata van de cursus. De pdf's zelf zitten niet in de
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
EMOJI = {(1, ''): '🔬', (2, ''): '🌿', (3, ''): '🧊', (5, ''): '🍎', (6, ''): '🫁', (7, ''): '❤️', (8, ''): '💧',
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


# ── Samenstellen ────────────────────────────────────────────────────────────
NOW = int(time.time() * 1000)
raw = json.load(open(RAW))
course = raw.get('course', raw)
pdfs = sorted(glob.glob(os.path.join(PDFDIR, '*Hoofdstuk*.pdf')), key=chapter_key)
widgets = []
total_img = 0
total_bytes = 0
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
    print(f"{ch['title'][:46]:46} secties={len(ch['sections']):2} afb={n if pdf else 0:2} flits={'ja' if w else 'nee'}")

course.update({
    'id': COURSE_ID,
    'title': 'Natuurwetenschappen 1e graad — voorbeeldcursus',
    'subtitle': 'Bestaande cursus van een leerkracht: 13 pdf-hoofdstukken, via Materiaal → “Samenvoegen tot één cursus” ingelezen en daarna aangevuld met afbeeldingen, doelcodes en flitskaarten.',
    'author': 'Voorbeeldmateriaal',
    'coverEmoji': '🧪',
    'code': 'NWVBAA',
    'curriculumId': CURRICULUM_ID,
    'createdAt': NOW, 'updatedAt': NOW,
})
payload = {'app': 'boosterz', 'kind': 'cursus', 'v': 1, 'course': course, 'widgets': widgets}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
print(f'\n{OUT_JSON}: {os.path.getsize(OUT_JSON)//1024} kB, {total_img} afbeeldingen ({total_bytes//1024} kB), {len(widgets)} flitskaartensets')
