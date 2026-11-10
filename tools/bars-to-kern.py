#!/usr/bin/env python3
"""把「每小节每只手」的逐音转写（JSON）合成 Humdrum kern（左手 staff2 | 右手 staff1，按时间对齐），再交给 check-kern.py 校验。
用法：python3 tools/bars-to-kern.py bars.json out.krn [--tempo 100] [--key '*k[]']
每小节：{"bar":1,"rh":"4r 4r 8a 8b","lh":"1r"}；音符 = 时值 + 音名（c=中央C，cc 高八度，C 低八度），和弦用 + 连接，连音线用 [ ]。"""
import json, sys, re
from fractions import Fraction

def parse_hand(s):
    ev = []; t = Fraction(0)
    for tok in s.split():
        tie_open = '[' in tok; tie_close = ']' in tok
        core = tok.replace('[', '').replace(']', '')
        m = re.match(r'^(\d+)(\.*)(.*)$', core)
        if not m: raise ValueError('bad token ' + tok)
        n, dots, pit = int(m.group(1)), len(m.group(2)), m.group(3)
        d = Fraction(4, n); add = d
        for _ in range(dots): add /= 2; d += add
        pits = [p for p in pit.split('+') if p]
        grace = any(re.search(r'[qQ]$', p) for p in pits)  # 小音符（装饰音）：谱上有但不占拍
        if grace: d = Fraction(0)
        ev.append((t, d, pits, tie_open, tie_close, n, dots, grace))
        if not grace: t += d
    return ev, t

def cell(e):
    t, d, pits, op, cl, n, dots, grace = e
    base = str(n) + '.' * dots
    out = []
    for p in pits:
        out.append(('[' if op else '') + base + p + (']' if cl else ''))
    return ' '.join(out)

def main():
    bars = json.load(open(sys.argv[1])); out = sys.argv[2]
    tempo = sys.argv[sys.argv.index('--tempo') + 1] if '--tempo' in sys.argv else '100'
    key = sys.argv[sys.argv.index('--key') + 1] if '--key' in sys.argv else '*k[]'
    L = ['**kern\t**kern', '*staff2\t*staff1', '*clefF4\t*clefG2', key + '\t' + key, '*M4/4\t*M4/4', '!\t!q=' + tempo]
    problems = []
    for b in sorted(bars, key=lambda x: x['bar']):
        lh, lt = parse_hand(b['lh']); rh, rt = parse_hand(b['rh'])
        if lt != 4 or rt != 4: problems.append((b['bar'], float(lt), float(rt)))
        L.append('=%d\t=%d' % (b['bar'], b['bar']))
        ons = sorted(set([e[0] for e in lh] + [e[0] for e in rh]))
        lm = {e[0]: e for e in lh if not e[7]}; rm = {e[0]: e for e in rh if not e[7]}
        lg = {}; rg = {}
        for e in lh:
            if e[7]: lg.setdefault(e[0], []).append(e)
        for e in rh:
            if e[7]: rg.setdefault(e[0], []).append(e)
        for o in ons:
            for gi in range(max(len(lg.get(o, [])), len(rg.get(o, [])))):  # 小音符先单独一行，再接主音
                L.append((cell(lg[o][gi]) if gi < len(lg.get(o, [])) else '.') + '\t' + (cell(rg[o][gi]) if gi < len(rg.get(o, [])) else '.'))
            L.append((cell(lm[o]) if o in lm else '.') + '\t' + (cell(rm[o]) if o in rm else '.'))
    last = max(b['bar'] for b in bars)
    L += ['==\t==', '*-\t*-']
    open(out, 'w').write('\n'.join(L) + '\n')
    for p in problems: print('小节 %d 拍数不对：左手 %s 右手 %s' % p)
    print('写入', out, '共', len(bars), '小节；有问题的小节', len(problems))

main()
