#!/usr/bin/env bash
# 一键自查：语法 → 乐理引擎 → 题目生成器 → 点音符 → 一天的完整流程 → 全页面体验审计
# 用法：bash tools/run-all.sh   （需要 node 和 playwright；会在 8765 端口起一个静态服务）
set -u
cd "$(dirname "$0")/.."
ok=0; bad=0
step() { echo; echo "── $1"; shift; if "$@"; then ok=$((ok+1)); else bad=$((bad+1)); echo "   ↑ 失败"; fi; }

step "语法检查" bash -c 'for f in *.js tools/*.js; do node --check "$f" || exit 1; done; echo "✓ $(ls *.js tools/*.js | wc -l) 个文件语法正确"'
step "没有重名函数（后写的会悄悄覆盖前面的）" bash -c 'd=$(for f in *.js; do grep -oE "^\s*function [a-zA-Z0-9_]+\(" "$f" | sed -E "s/^\s*function //; s/\(//" | sort | uniq -d | sed "s|^|$f: |"; done); if [ -n "$d" ]; then echo "$d"; exit 1; fi; echo "✓ 没有重名函数"'
step "关键界面不为空" node tools/test-views.js
step "乐理引擎" node tools/test-theory.js

if ! curl -s -o /dev/null http://localhost:8765/index.html; then (python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1; fi
step "题目生成器" node tools/test-generators.js
step "点音符发声" bash -c 'out=$(node tools/test-notes.js); echo "$out"; ! echo "$out" | grep -qv "\"total\":\([0-9]*\),\"single\":\1"'
step "一天的完整流程" bash -c 'out=$(node tools/test-flow.js); echo "$out"; echo "$out" | grep -q "today ring: 4/4" && echo "$out" | tail -1 | grep -q "no errors"'
step "全页面体验审计" bash -c 'out=$(node tools/audit.js); echo "$out"; echo "$out" | grep -q "① 自评按钮： 无" && echo "$out" | grep -q "② 没有解释链接的术语： 无" && echo "$out" | grep -q "失效 0" && echo "$out" | grep -q "④ 页面错误： 无" && echo "$out" | grep -q "缺解释 0 · 和别的词重复 0"'

echo; echo "════ 通过 $ok 项，失败 $bad 项"
exit $bad
