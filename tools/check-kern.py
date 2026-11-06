#!/usr/bin/env python3
"""检查 Humdrum kern 扒谱：每个声部每小节的拍数必须等于拍号（弱起小节除外），音名格式合法。
用法：python3 tools/check-kern.py 文件.krn [--pickup 0] [--beats 4]
输出每个出错的小节；全部正确时打印 OK 和小节数。"""
import re, sys
from fractions import Fraction

def dur(tok):
    if tok in ('.',) or tok.startswith('*') or tok.startswith('!'):
        return None
    total = None
    for sub in tok.split(' '):  # 和弦：空格分开的几个音，时值取第一个
        if 'q' in sub:  # 装饰音不占时值
            return Fraction(0)
        m = re.match(r'^[\[\(\{&]*(\d+)(%\d+)?(\.*)', sub)
        if not m:
            raise ValueError('没有时值: ' + sub)
        d = Fraction(4, int(m.group(1)))
        if m.group(2):
            d = Fraction(4 * int(m.group(2)[1:]), int(m.group(1)))
        dots = len(m.group(3)); add = d
        for _ in range(dots):
            add /= 2; d += add
        if not re.search(r'([a-gA-G]+[#\-n]*|r)', sub):
            raise ValueError('没有音名: ' + sub)
        total = d if total is None else total
    return total

def main():
    path = sys.argv[1]
    beats = Fraction(int(sys.argv[sys.argv.index('--beats') + 1])) if '--beats' in sys.argv else Fraction(4)
    pickup = int(sys.argv[sys.argv.index('--pickup') + 1]) if '--pickup' in sys.argv else None
    lines = [l.rstrip('\n') for l in open(path, encoding='utf-8') if l.strip() and not l.startswith('!!')]
    nsp = None; bar = None; sums = None; errs = []; nbars = 0; pending = None
    def close():
        if bar is None or sums is None: return
        for i, s in enumerate(sums):
            if s is None: continue
            want = beats
            if s != want and not (pickup is not None and bar == pickup):
                errs.append(f'第 {bar} 小节 第 {i+1} 个声部: {s} 拍（应为 {want}）')
    for ln, l in enumerate(lines, 1):
        f = l.split('\t')
        if nsp is None: nsp = len(f)
        if len(f) != nsp:
            errs.append(f'第 {ln} 行: 声部数 {len(f)} ≠ {nsp}（不要拆分声部）'); continue
        if f[0].startswith('='):
            close(); m = re.match(r'=(\d+)', f[0])
            if not m: bar = None; sums = None; continue  # 终止线 ==
            bar = int(m.group(1)); sums = [Fraction(0)] * nsp; nbars += 1
            continue
        if f[0].startswith('*') or f[0].startswith('!'):
            if f[0].startswith('**'): sums = None
            continue
        if sums is None: sums = [Fraction(0)] * nsp
        for i, tok in enumerate(f):
            try:
                d = dur(tok)
            except ValueError as e:
                errs.append(f'第 {ln} 行 第 {i+1} 声部: {e}'); continue
            if d is not None and sums[i] is not None: sums[i] += d
    close()
    if errs:
        print('\n'.join(errs)); sys.exit(1)
    print(f'OK · {nbars} 个小节线')

main()
