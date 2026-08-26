/*
 * constraints/renban.js
 *
 * Renban lines: digits on the line form a set of consecutive integers, in
 * any order, with no repeats. On placement we track per-line
 *   mask   — bit-set of digits already present
 *   min/max — bounds of the digits present (for span check)
 *   filled — count of placed cells
 * so both checks and pruning are O(1) per touched cell.
 */
self.SudokuConstraints.register({
  id: 'renban',

  newFields(p)         { p.renbans = []; },
  serialize(p)         { return { renbans: p.renbans || [] }; },
  deserialize(p, j)    { p.renbans = (j.renbans || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.renbans || [])) {
      const len = line.length;
      if (len < 2) continue;
      let seen = 0, filled = 0, lo = Infinity, hi = -Infinity, dup = false;
      for (const i of line) {
        const v = values[i]; if (!v) continue;
        filled++;
        const mb = 1 << (v - 1);
        if (seen & mb) { dup = true; break; }
        seen |= mb;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (dup) { line.forEach(i => { if (values[i]) ctx.conflicts.add(i); }); continue; }
      if (filled >= 2 && (hi - lo) > (len - 1)) {
        line.forEach(i => { if (values[i]) ctx.conflicts.add(i); });
      }
    }
  },

  solverInit(p, ctx) {
    const lines = p.renbans || [];
    if (!lines.length) return null;
    const N = ctx.N;
    const lookup = Array.from({ length: N * N }, () => []);
    lines.forEach((line, ri) => { for (const i of line) lookup[i].push(ri); });
    return {
      lines,
      lookup,
      mask:   new Int32Array(lines.length),
      min:    new Int32Array(lines.length).fill(N + 1),
      max:    new Int32Array(lines.length).fill(0),
      filled: new Int32Array(lines.length),
    };
  },

  solverCheck(p, ctx, h, i, v) {
    const mb = ctx.bit(v);
    for (const ri of h.lookup[i]) {
      if (h.mask[ri] & mb) return false;
      const newMin = v < h.min[ri] ? v : h.min[ri];
      const newMax = v > h.max[ri] ? v : h.max[ri];
      if ((newMax - newMin) > (h.lines[ri].length - 1)) return false;
    }
    return true;
  },

  solverCommit(p, ctx, h, i, v) {
    const mb = ctx.bit(v);
    for (const ri of h.lookup[i]) {
      h.mask[ri] |= mb;
      if (v < h.min[ri]) h.min[ri] = v;
      if (v > h.max[ri]) h.max[ri] = v;
      h.filled[ri] += 1;
    }
  },

  solverUnplace(p, ctx, h, i, v) {
    const mb = ctx.bit(v);
    const N = ctx.N;
    for (const ri of h.lookup[i]) {
      h.mask[ri] &= ~mb;
      h.filled[ri] -= 1;
      const m = h.mask[ri];
      if (m === 0) { h.min[ri] = N + 1; h.max[ri] = 0; }
      else {
        let lo = 0; while (!((m >> lo) & 1)) lo++;
        let hi = N - 1; while (!((m >> hi) & 1)) hi--;
        h.min[ri] = lo + 1;
        h.max[ri] = hi + 1;
      }
    }
  },

  solverForbid(p, ctx, h, i, used) {
    const N = ctx.N;
    for (const ri of h.lookup[i]) {
      used |= h.mask[ri];
      const len = h.lines[ri].length;
      if (h.filled[ri] > 0) {
        const lo = Math.max(1, h.max[ri] - (len - 1));
        const hi = Math.min(N, h.min[ri] + (len - 1));
        for (let v = 1; v < lo; v++) used |= ctx.bit(v);
        for (let v = hi + 1; v <= N; v++) used |= ctx.bit(v);
      }
    }
    return used;
  },
});
