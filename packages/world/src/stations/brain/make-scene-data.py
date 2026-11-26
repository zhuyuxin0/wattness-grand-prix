# make-scene-data.py <build-brain.json> <read-again-dir> <out-dir>
#   build-brain.json: the site's file from the Living Brain build (its pages, connections, tab map and corrections);
#   read-again-dir: grand-prix.json, terminal.json and battery-review.json, each with Living Brain's graph as its API
#   returned it (GET only); out-dir: where brain-scene.json and lb-order.json are written (this folder).
# The brain scene's data, derived from the site file (build-brain.json) and Living Brain's own node order (the graph
# read again through the API at 26 Nov 12:57:27 Bangkok, 25 Nov 23:57:27 CT, GET only). Writes brain-scene.json and
# lb-order.json. Nothing here is invented: every count is recomputed from the rows and checked against the file's own
# totals, and the script stops on any mismatch.
import hashlib
import json
import os
import sys
from collections import Counter

src, vdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(src, 'rb').read()
d = json.loads(raw)
cb = d['combined']

# Living Brain's member order in the combined view, and the colors its combined view gives members by that order
# (#ff6fae, #8f8cff, #59e3b2, #ffb45e, #70c9ff, #d68cff).
MEMBERS = [('grand-prix', 'Wattness Grand Prix', '#ff6fae'),
           ('battery-review', 'Wattness DSWL_ESS_ESR1 review', '#8f8cff'),
           ('terminal', 'Wattness Brain', '#59e3b2')]
BRAIN_NAME = {b: n for b, n, _ in MEMBERS}

order = {}
for brain, f in [('grand-prix', 'grand-prix.json'), ('terminal', 'terminal.json'), ('battery-review', 'battery-review.json')]:
    g = json.load(open(os.path.join(vdir, f)))['graph']
    order[brain] = [n['slug'] for n in g['nodes']]

pages = cb['pages']
own = [c for c in cb['connections'] if 'brain' in c]
cross = [c for c in cb['connections'] if 'aBrain' in c]

deg = Counter()
for c in own:
    deg[(c['brain'], c['a'])] += 1
    deg[(c['brain'], c['b'])] += 1
xdeg = Counter()
for c in cross:
    xdeg[(c['aBrain'], c['a'])] += 1
    xdeg[(c['bBrain'], c['b'])] += 1

tab_of = {}
for tid, t in d['tabs'].items():
    tab_of[t['page']] = tid

out_pages = []
for p in pages:
    b = p['brain']
    if p['slug'] not in order[b]:
        sys.exit(f'page {b}:{p["slug"]} missing from Living Brain order')
    row = {
        'brain': b, 'slug': p['slug'], 'title': p['title'],
        'n': order[b].index(p['slug']) + 1,
        'connections': deg[(b, p['slug'])],
        'across': xdeg[(b, p['slug'])],
        'summary': p.get('summary'),
    }
    if p.get('correction'):
        row['correction'] = p['correction']
    if b == 'grand-prix' and p['slug'] in tab_of:
        row['tab'] = tab_of[p['slug']]
    if p.get('connections') is not None and p['connections'] != row['connections']:
        sys.exit(f'degree mismatch on {b}:{p["slug"]}')
    out_pages.append(row)
out_pages.sort(key=lambda r: ([m[0] for m in MEMBERS].index(r['brain']), r['n']))

brains = []
for b, name, color in MEMBERS:
    m = next(x for x in cb['members'] if x['brain'] == b)
    oc = [c for c in own if c['brain'] == b]
    st = Counter(c['strength'] for c in oc)
    n_pages = sum(1 for p in out_pages if p['brain'] == b)
    if n_pages != m['pages'] or len(oc) != m['connections']:
        sys.exit(f'count mismatch on {b}')
    row = {'id': b, 'name': name, 'color': color, 'pages': n_pages, 'connections': len(oc),
           'strong': st['strong'], 'medium': st['medium'], 'weak': st['weak']}
    if b == 'grand-prix':
        if d['brain']['pages'] != n_pages or d['brain']['connections'] != len(oc):
            sys.exit('brain totals mismatch')
        row['notes'] = d['brain']['notes']['compiled']
        row['readAt'] = d['brain']['readAt']
    brains.append(row)

pairs = Counter(tuple(sorted((c['aBrain'], c['bBrain']))) for c in cross)
cst = Counter(c['strength'] for c in cross)
ends = {(c['aBrain'], c['a']) for c in cross} | {(c['bBrain'], c['b']) for c in cross}
if len(cross) != cb['crossBrainConnections']:
    sys.exit('cross count mismatch')

scene = {
    'schema': 'gatelock-world.brain-scene.v1',
    'note': ("The three Living Brain brains of Wattness Grand Prix and their combination, for the brain station and the "
             "Memory tab. Derived from build-brain.json (the site file: pages, connections, the tab map, and the "
             "corrections written beside Living Brain's own summaries and reasoning) and from Living Brain's node order "
             "(the graph read back through its API, GET only, 25 Nov 23:57:27 CT). n is a page's place in that order "
             "inside its own brain (most connected first), which is the number Living Brain prints on the page's tag."),
    'source': {'file': 'build-brain.json', 'schema': d['schema'], 'sha256': hashlib.sha256(raw).hexdigest(),
               'read': d['brain']['readAt'], 'crossChecked': cb['crossBrainChecked']['at']},
    'combined': {'name': cb['name'], 'pages': cb['pagesAllBrains'], 'across': len(cross),
                 'acrossByPair': {f'{a}|{b}': n for (a, b), n in sorted(pairs.items())},
                 'acrossByStrength': dict(cst), 'pagesJoined': len(ends)},
    'brains': brains,
    'pages': out_pages,
    'connections': [{'brain': c['brain'], 'a': c['a'], 'b': c['b'], 'strength': c['strength'],
                     'similarity': c['similarity'], 'reasoning': c.get('reasoning'),
                     **({'correction': c['correction']} if c.get('correction') else {})} for c in own],
    'across': [{'aBrain': c['aBrain'], 'a': c['a'], 'bBrain': c['bBrain'], 'b': c['b'], 'strength': c['strength'],
                'similarity': c['similarity'], 'made': c['made'], 'reasoning': c.get('reasoning'),
                **({'correction': c['correction']} if c.get('correction') else {}),
                **({'conflict': c['conflict']} if c.get('conflict') else {})} for c in cross],
    'conflicts': cb['conflicts'],
    'tabs': {tid: {'label': t['label'], 'group': t['group'], 'page': t['page'], 'also': t.get('also', []),
                   **({'section': t['section']} if t.get('section') else {})} for tid, t in d['tabs'].items()},
}
os.makedirs(out, exist_ok=True)
json.dump(scene, open(os.path.join(out, 'brain-scene.json'), 'w'), ensure_ascii=False, indent=1)
json.dump({'note': "Living Brain's node order per brain (graph read 25 Nov 23:57:27 CT, GET only).", 'order': order},
          open(os.path.join(out, 'lb-order.json'), 'w'), ensure_ascii=False, indent=1)
print('pages', len(out_pages), 'own', len(own), 'across', len(cross), 'brains', [(b['id'], b['pages'], b['connections']) for b in brains])
print('sha256 brain-scene.json', hashlib.sha256(open(os.path.join(out, 'brain-scene.json'), 'rb').read()).hexdigest())
