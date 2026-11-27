# diff-speed-01

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/noedistro/diff-speed-01/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/noedistro/diff-speed-01/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

Exact makefun-diff 1.0.0 clone: a fast forward Myers greedy line diff, 20,000–40,000 lines, 4 cases, about 2.6x faster than the house baseline, 0 dependencies.

## What it does

`solve.js` exports `run(input)`, which returns exactly what makefun-diff 1.0.0 returns for `{ old, new }` — the same patch, byte for byte — but faster: line interning to integer ids, prefix/suffix trim, and a forward Myers greedy search on typed arrays with full V-history backtracking, reproducing make.fun's deletion-wins-ties rule exactly. `main.ts` is the house driver: it reads `/input/cases.json`, answers each case with `run`, and writes `/output/answers.json`.

## Run

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

Node 22. No dependencies, no network, no caching between cases, deterministic output.

<sub>Entered on [make.fun](https://make.fun/?ref=ak5nnnr2&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
