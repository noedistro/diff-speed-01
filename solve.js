// Exact makefun-diff 1.0.0 clone — fast forward Myers greedy (see PLAN.md §2.1).
// Dependency-free ES module. run(input) returns exactly diffPatch(input)
// for every input { old, new } of two strings. No caching between cases,
// no network, no timers, no workers, single-threaded and deterministic.

const TYPE_ERR = 'makefun-diff: the input is { old, new }, two strings';
const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/**
 * Tokenize a text into lines (cut after every '\n'; a bare last line is a
 * line too; the empty text has no lines) and intern each line to an integer
 * id in the shared per-run Map. Returns an Int32Array of ids.
 * Line strings are stored once in `byId` (index = id) for patch output.
 */
function tokenizeIntern(text, map, byId) {
  const ids = [];
  let start = 0;
  const len = text.length;
  for (;;) {
    const idx = text.indexOf('\n', start);
    if (idx === -1) {
      if (start < len) {
        const line = text.slice(start);
        let id = map.get(line);
        if (id === undefined) {
          id = byId.length;
          map.set(line, id);
          byId.push(line);
        }
        ids.push(id);
      }
      break;
    }
    const line = text.slice(start, idx + 1);
    let id = map.get(line);
    if (id === undefined) {
      id = byId.length;
      map.set(line, id);
      byId.push(line);
    }
    ids.push(id);
    start = idx + 1;
  }
  return Int32Array.from(ids);
}

/**
 * Forward Myers greedy on the trimmed middle, returning the run list
 * [{ kind, count }] for the middle (KEEP/DELETE/INSERT, in order).
 * `a`/`b` are the full id arrays, `px`/`py` the prefix offsets, `n`/`m`
 * the trimmed middle lengths. Follows PLAN.md §2.1(c) exactly, with the
 * Session B corrected guards: deletion valid iff Vprev[k-1] < n,
 * insertion valid iff Vprev[k+1] - k <= m; deletion wins ties (>=).
 */
function myersRuns(a, b, px, py, n, m) {
  // Work on zero-copy views of the trimmed middle.
  const av = a.subarray(px, px + n);
  const bv = b.subarray(py, py + m);
  // History stores x+1 (so 0 = invalid sentinel; a fresh Int32Array is
  // already zero-filled, which removes the per-row fill(-1) pass).
  // d = 0: bare snake from (0, 0).
  let x = 0;
  while (x < n && x < m && av[x] === bv[x]) x++;
  const hist = [new Int32Array([x + 1])];
  if (x === n && x === m) return x === 0 ? [] : [{ kind: KEEP, count: x }];

  let D = -1;
  let K = 0;
  for (let d = 1; d <= n + m; d++) {
    const prev = hist[d - 1];
    const prevLen = prev.length; // 2d-1
    const cur = new Int32Array(2 * d + 1);
    let done = false;
    for (let k = -d, kd = 0; k <= d; k += 2, kd += 2) {
      const iDel = kd - 2; // slot of (d-1, k-1)
      const iIns = kd; // slot of (d-1, k+1)
      const vDel = iDel >= 0 && iDel < prevLen ? prev[iDel] : 0;
      const vIns = iIns >= 0 && iIns < prevLen ? prev[iIns] : 0;
      const xDel = vDel - 1;
      const xIns = vIns - 1;
      const delLive = vDel !== 0 && xDel < n;
      const insLive = vIns !== 0 && xIns - k <= m;
      if (!delLive && !insLive) continue;
      const byDeletion = delLive ? xDel : -2;
      const byInsertion = insLive ? xIns - 1 : -2;
      let xx;
      if (byDeletion >= byInsertion) xx = xDel + 1;
      else xx = xIns;
      let y = xx - k;
      while (xx < n && y < m && av[xx] === bv[y]) {
        xx++;
        y++;
      }
      cur[kd] = xx + 1;
      if (xx === n && y === m) {
        D = d;
        K = k;
        done = true;
        break;
      }
    }
    hist.push(cur);
    if (done) break;
  }
  if (D === -1) throw new Error('makefun-diff: the search ended without reaching both ends');

  // Backtrack from (D, K), collecting KEEP-then-EDIT per step (reverse order).
  const collected = new Array(2 * D + 2);
  let ci = 0;
  let d = D;
  let k = K;
  x = hist[D][K + D] - 1;
  while (d >= 1) {
    const prev = hist[d - 1];
    const prevLen = prev.length;
    const iDel = k + d - 2;
    const iIns = k + d;
    const vDel = iDel >= 0 && iDel < prevLen ? prev[iDel] : 0;
    const vIns = iIns >= 0 && iIns < prevLen ? prev[iIns] : 0;
    const xDel = vDel - 1;
    const xIns = vIns - 1;
    const delLive = vDel !== 0 && xDel < n;
    const insLive = vIns !== 0 && xIns - k <= m;
    const byDeletion = delLive ? xDel : -2;
    const byInsertion = insLive ? xIns - 1 : -2;
    let x0;
    let edit;
    let pk;
    if (byDeletion >= byInsertion) {
      x0 = xDel + 1;
      edit = DELETE;
      pk = k - 1;
    } else {
      x0 = xIns;
      edit = INSERT;
      pk = k + 1;
    }
    const keepLen = x - x0;
    if (keepLen > 0) collected[ci++] = { kind: KEEP, count: keepLen };
    collected[ci++] = { kind: edit, count: 1 };
    x = byDeletion >= byInsertion ? xDel : xIns;
    d--;
    k = pk;
  }
  if (x > 0) collected[ci++] = { kind: KEEP, count: x };
  // Reverse in place, dropping zero-length keeps (none can occur here
  // except keeps of length 0, which we never pushed) and merging
  // same-kind neighbours (successive 1-edits of one kind).
  const runs = [];
  for (let i = ci - 1; i >= 0; i--) {
    const r = collected[i];
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last.kind === r.kind) last.count += r.count;
    else runs.push({ kind: r.kind, count: r.count });
  }
  return runs;
}

/**
 * make.fun's own patch of input.old into input.new, as one string.
 * Identical to makefun-diff 1.0.0's diffPatch for every input.
 */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError(TYPE_ERR);
  }
  const map = new Map();
  const byId = [];
  const aIds = tokenizeIntern(input.old, map, byId);
  const bIds = tokenizeIntern(input.new, map, byId);
  const N = aIds.length;
  const M = bIds.length;

  // Common prefix, then common suffix of what is left (never overlapping).
  let prefix = 0;
  while (prefix < N && prefix < M && aIds[prefix] === bIds[prefix]) prefix++;
  let suffix = 0;
  while (suffix < N - prefix && suffix < M - prefix && aIds[N - 1 - suffix] === bIds[M - 1 - suffix]) suffix++;
  const n = N - prefix - suffix;
  const m = M - prefix - suffix;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  if (n > 0 || m > 0) {
    const mid = myersRuns(aIds, bIds, prefix, prefix, n, m);
    for (const r of mid) runs.push(r);
  }
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // Change runs: each a stretch of deletions/insertions between kept lines.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // Hunks: change runs at most 6 kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 6) h.push(c);
    else hunks.push([c]);
  }

  const out = [`makefun-diff/1 old=${N} new=${M} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = first.o - 3 < 0 ? 0 : first.o - 3;
    const newStart = first.p - (first.o - oldStart);
    const after = N - (last.o + last.dels) < 3 ? N - (last.o + last.dels) : 3;
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) {
        const line = byId[aIds[at]];
        if (line.charCodeAt(line.length - 1) === 10) out.push('=', line);
        else out.push('=', line, '\n%\n');
      }
      for (let i = 0; i < c.dels; i++) {
        const line = byId[aIds[c.o + i]];
        if (line.charCodeAt(line.length - 1) === 10) out.push('-', line);
        else out.push('-', line, '\n%\n');
      }
      for (let i = 0; i < c.ins; i++) {
        const line = byId[bIds[c.p + i]];
        if (line.charCodeAt(line.length - 1) === 10) out.push('+', line);
        else out.push('+', line, '\n%\n');
      }
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) {
      const line = byId[aIds[at]];
      if (line.charCodeAt(line.length - 1) === 10) out.push('=', line);
      else out.push('=', line, '\n%\n');
    }
  }
  return out.join('');
}
