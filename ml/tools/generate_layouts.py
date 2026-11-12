"""Generate street layouts for the sites of a replay set with a workspace checkpoint, as compact text for
training.fn_model_layout_load. SAMPLES layouts are drawn per site (the four views and the yield targets in turn),
exact repeats are dropped, streets shorter than MIN_FT are dropped, and the workspace's rough lot count orders them.
KEEP = how many go out per site (0 = all). The database's own lot cutter does the ranking that counts.
usage: python generate_layouts.py <checkpoint> <split> <samples> <keep> <out.txt> <export files...>
env: CFG = generation overrides as JSON, SEED, MIN_FT (default 60), MODULE = path of the layout_model.py to use"""
import sys, json, os, time, importlib.util
mod = os.environ.get('MODULE', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'optimizer_ml', 'layout_model.py'))
spec = importlib.util.spec_from_file_location('lm', mod)
lm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lm)
import torch
ck, split, samples, keep, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
model, cfg, yt = lm.load_model(ck)
cfg = dict(cfg, **json.loads(os.environ.get('CFG', '{}')))
min_ft = float(os.environ.get('MIN_FT', '60'))
covers = [float(x) for x in os.environ.get('COVERS', '').split(',') if x]      # street-cover targets used in turn (see min_street_cover)
lines = [l for f in sys.argv[6:] for l in lm.read_export(f)]
sites, drop = lm.parse_lines(lines, cfg)
group = [s for s in sites if s['split'] == split][:int(os.environ.get('LIMIT', '100000'))]
torch.manual_seed(int(os.environ.get('SEED', '0')))
rows, t0, n_new, n_ft, est, n_dup, n_empty = [], time.time(), 0, 0.0, 0, 0, 0
for s in group:
    b = lm.turtle_frame(s)[0] if cfg.get('turtle') else lm.canon(s)[0]
    P = lm.poly_of(b)
    cands, seen = [], set()
    for t in range(samples):
        try:
            c = dict(cfg, min_street_cover=covers[t % len(covers)]) if covers else cfg
            roads = lm.generate(model, s, c, yt[(t // 4) % len(yt)] if cfg.get('canon_frame') else yt[t % len(yt)], None, t)
            new = [r for r in roads if not r['ctx'] and len(r['line']) >= 2 and lm.line_len(r['line']) >= min_ft]
            if not new:
                n_empty += 1
                continue
            txt = ';'.join(','.join('%d %d' % (round(x), round(y)) for x, y in r['line']) for r in new)
            if txt in seen:
                n_dup += 1
                continue
            seen.add(txt)
            try:
                score = lm.resolve(s, b, lm.pack(s, cfg, [r for r in roads if r['ctx']] + new, P), cfg, s['w'])[0]
            except Exception:
                score = 0
        except Exception:
            n_empty += 1
            continue
        cands.append((score, t, new, txt))
    cands.sort(key=lambda c: (-c[0], c[1]))
    for rank, (score, t, new, txt) in enumerate(cands[:keep] if keep else cands, 1):
        n_new += len(new); n_ft += sum(lm.line_len(r['line']) for r in new); est += score
        rows.append('%s|%d|%s' % (s['key'][:12], t + 1, txt))      # the try number is the sample's own number, so the settings behind a layout can be read back
open(out, 'w').write('\n'.join(rows))
print(json.dumps({'sites': len(group), 'layouts': len(rows), 'repeats_dropped': n_dup, 'empty': n_empty, 'avg_new_streets': round(n_new / max(1, len(rows)), 2),
                  'avg_new_street_ft': round(n_ft / max(1, len(rows))), 'avg_rough_lots': round(est / max(1, len(rows)), 1),
                  'built_lots_avg': round(sum(s['n_total'] for s in group) / max(1, len(group)), 1), 'bytes': sum(len(r) + 1 for r in rows), 'seconds': round(time.time() - t0)}))
