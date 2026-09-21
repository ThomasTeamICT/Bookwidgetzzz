#!/usr/bin/env python3
"""Controleert een oefeningen-json (zie SCHEMA.md). Gebruik:
   python3 tools/oefeningen/valideer.py h05.json [secties.json]
Sluit af met code 1 bij fouten en drukt ze af."""
import json, re, sys

WIDGETS = {'quiz', 'exitticket', 'worksheet', 'pairs', 'memory', 'scramble', 'hangman', 'wordsearch', 'crossword', 'poll', 'checklist'}
QTYPES = {'mc', 'multi', 'tf', 'short', 'long', 'gap', 'match', 'order', 'number', 'dropdown', 'marktext', 'sort', 'table', 'info'}


def check_question(q, where, errs):
    t = q.get('type')
    if t not in QTYPES:
        errs.append(f'{where}: onbekend vraagtype {t!r}'); return
    if not isinstance(q.get('prompt'), str) or not q['prompt'].strip():
        errs.append(f'{where}: prompt ontbreekt')
    if t == 'mc':
        o = q.get('options'); ci = q.get('correctIndex')
        if not isinstance(o, list) or len(o) < 3 or len(set(o)) != len(o): errs.append(f'{where}: mc heeft 3–5 unieke options nodig')
        elif not isinstance(ci, int) or not 0 <= ci < len(o): errs.append(f'{where}: correctIndex buiten bereik')
    elif t == 'multi':
        o = q.get('options'); ci = q.get('correctIndices')
        if not isinstance(o, list) or len(o) < 3: errs.append(f'{where}: multi heeft ≥ 3 options nodig')
        elif not isinstance(ci, list) or len(ci) < 2 or any(not isinstance(i, int) or not 0 <= i < len(o) for i in ci): errs.append(f'{where}: correctIndices ongeldig (≥ 2, binnen bereik)')
    elif t == 'tf':
        if not isinstance(q.get('answer'), bool): errs.append(f'{where}: tf.answer moet true/false zijn')
    elif t == 'short':
        a = q.get('accepted')
        if not isinstance(a, list) or not a or any(not isinstance(x, str) or not x.strip() for x in a): errs.append(f'{where}: short.accepted leeg')
    elif t == 'long':
        if not q.get('modelAnswer'): errs.append(f'{where}: long.modelAnswer ontbreekt')
        r = q.get('rubric')
        if r is not None and (not isinstance(r, list) or any('criterion' not in c or not isinstance(c.get('points'), (int, float)) for c in r)): errs.append(f'{where}: rubric ongeldig')
    elif t == 'gap':
        gaps = re.findall(r'\[([^\]]+)\]', q.get('text', ''))
        if not gaps: errs.append(f'{where}: gap.text zonder [gat]')
    elif t == 'match':
        p = q.get('pairs')
        if not isinstance(p, list) or len(p) < 3 or any(not c.get('left') or not c.get('right') for c in p): errs.append(f'{where}: match.pairs (≥ 3, left/right)')
        elif len({c['right'] for c in p}) != len(p): errs.append(f'{where}: match: dubbele right-waarden')
    elif t == 'order':
        it = q.get('items')
        if not isinstance(it, list) or len(it) < 3 or len(set(it)) != len(it): errs.append(f'{where}: order.items (≥ 3, uniek)')
    elif t == 'number':
        if not isinstance(q.get('answer'), (int, float)) or not isinstance(q.get('tolerance'), (int, float)): errs.append(f'{where}: number.answer/tolerance')
    elif t == 'dropdown':
        sets = re.findall(r'\{([^}]+)\}', q.get('text', ''))
        if not sets or any(len(s.split('|')) < 2 for s in sets): errs.append(f'{where}: dropdown.text zonder {{juist|fout}}')
    elif t == 'marktext':
        if not re.search(r'\[[^\]]+\]', q.get('text', '')): errs.append(f'{where}: marktext.text zonder [woord]')
    elif t == 'sort':
        cats = q.get('categories'); items = q.get('items')
        if not isinstance(cats, list) or len(cats) < 2: errs.append(f'{where}: sort.categories (≥ 2)')
        elif not isinstance(items, list) or len(items) < 4 or any(i.get('category') not in cats for i in items): errs.append(f'{where}: sort.items: category moet een naam uit categories zijn')
    elif t == 'table':
        cols = q.get('columns'); rows = q.get('rows')
        if not isinstance(cols, list) or len(cols) < 2 or not isinstance(rows, list) or not rows: errs.append(f'{where}: table.columns/rows')
        else:
            for ri, r in enumerate(rows):
                cells, ans = r.get('cells'), r.get('answers')
                if not isinstance(cells, list) or not isinstance(ans, list) or len(cells) != len(cols) or len(ans) != len(cols): errs.append(f'{where} rij {ri}: cells/answers ≠ kolommen')
                elif not any(c == '' and a for c, a in zip(cells, ans)): errs.append(f'{where} rij {ri}: geen invulcel (lege cel met answer)')


def check_widget(w, i, secties, errs):
    where = f'oefening {i} ({w.get("titel", "?")})'
    if w.get('type') not in WIDGETS: errs.append(f'{where}: onbekend type {w.get("type")!r}'); return
    if not w.get('titel'): errs.append(f'{where}: titel ontbreekt')
    if not w.get('toelichting'): errs.append(f'{where}: toelichting ontbreekt')
    sec = str(w.get('sectie', '')).strip()
    if secties is not None and not any(s.lower().startswith(sec.lower()) for s in secties): errs.append(f'{where}: sectie {sec!r} bestaat niet')
    if w.get('plaats', 'einde') not in ('einde', 'begin'): errs.append(f'{where}: plaats moet einde/begin zijn')
    c = w.get('config') or {}
    t = w['type']
    if t in ('quiz', 'exitticket', 'worksheet'):
        qs = c.get('questions')
        if not isinstance(qs, list) or not qs: errs.append(f'{where}: questions ontbreken'); return
        for qi, q in enumerate(qs): check_question(q, f'{where} vraag {qi + 1}', errs)
        real = [q for q in qs if q.get('type') != 'info']
        if t == 'exitticket' and not 2 <= len(real) <= 5: errs.append(f'{where}: exit-ticket heeft 2–5 vragen')
        if not real: errs.append(f'{where}: alleen infoblokken')
    elif t == 'pairs':
        p = c.get('pairs')
        if not isinstance(p, list) or len(p) < 3 or any(not x.get('left') or not x.get('right') for x in p): errs.append(f'{where}: pairs (≥ 3, left/right)')
    elif t == 'memory':
        p = c.get('pairs')
        if not isinstance(p, list) or len(p) < 4 or any(not x.get('a') or not x.get('b') for x in p): errs.append(f'{where}: memory pairs (≥ 4, a/b)')
        elif any(len(x['a']) > 60 or len(x['b']) > 60 for x in p): errs.append(f'{where}: memory-kaartjes te lang (≤ 60 tekens)')
    elif t == 'scramble':
        if c.get('mode') not in ('word', 'sentence'): errs.append(f'{where}: scramble.mode')
        it = c.get('items')
        if not isinstance(it, list) or len(it) < 3 or any(not x.get('text') for x in it): errs.append(f'{where}: scramble.items')
        elif c.get('mode') == 'word' and any(' ' in x['text'].strip() for x in it): errs.append(f'{where}: scramble word-modus: één woord per item')
    elif t == 'hangman':
        ws = c.get('words')
        if not isinstance(ws, list) or len(ws) < 3 or any(not x.get('word') or ' ' in x['word'] or not x.get('hint') for x in ws): errs.append(f'{where}: hangman.words (word zonder spatie + hint)')
    elif t == 'wordsearch':
        ws = c.get('words')
        if not isinstance(ws, list) or len(ws) < 5 or any(' ' in x or len(x) > 12 or not x.isalpha() for x in ws): errs.append(f'{where}: wordsearch.words (≥ 5, letters, ≤ 12, geen spaties)')
    elif t == 'crossword':
        es = c.get('entries')
        if not isinstance(es, list) or len(es) < 4 or any(' ' in x.get('word', '') or not x.get('word') or not x.get('clue') for x in es): errs.append(f'{where}: crossword.entries (word zonder spatie + clue)')
    elif t == 'poll':
        if not c.get('question') or not isinstance(c.get('options'), list) or len(c['options']) < 2: errs.append(f'{where}: poll')
    elif t == 'checklist':
        if not c.get('title') or not isinstance(c.get('items'), list) or len(c['items']) < 2: errs.append(f'{where}: checklist')


def main():
    path = sys.argv[1]
    secties = None
    data = json.load(open(path, encoding='utf-8'))
    errs = []
    hn = str(data.get('hoofdstuk', ''))
    if len(sys.argv) > 2:
        alle = json.load(open(sys.argv[2], encoding='utf-8'))
        if hn not in alle: errs.append(f'hoofdstuk {hn!r} onbekend (verwacht een van {sorted(alle)})')
        else: secties = alle[hn]['secties']
    oef = data.get('oefeningen')
    if not isinstance(oef, list) or not oef: errs.append('oefeningen ontbreken')
    else:
        for i, w in enumerate(oef, 1): check_widget(w, i, secties, errs)
    if errs:
        print('\n'.join(errs)); sys.exit(1)
    n = sum(len([q for q in (w.get('config') or {}).get('questions', []) if q.get('type') != 'info']) for w in oef)
    print(f'ok: {len(oef)} oefeningen, {n} vragen')


if __name__ == '__main__':
    main()
