/*
 * constraints/sequence.js
 *
 * Sequence line: digits along the line form an arithmetic progression
 * (constant successive difference). Direction/sign is free (may increase
 * or decrease), and step 0 is allowed (1-1-1... is a valid sequence).
 *
 * Check: for any three consecutive filled cells (a, b, c),
 *          2*b == a + c
 * Solver: once two cells anywhere on the line are known, the step is
 *   determined; every other position has a unique required value that
 *   must fit within [1..N].
 *
 * State model:
 *   p.sequenceLines = [[idx, ...], ...]
 */
self.SudokuConstraints.register({
  id: 'sequence',

  newFields(p)      { p.sequenceLines = []; },
  serialize(p)      { return { sequenceLines: p.sequenceLines || [] }; },
  deserialize(p, j) { p.sequenceLines = (j.sequenceLines || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.sequenceLines || [])) {
      const len = line.length;
      for (let k = 0; k + 2 < len; k++) {
        const a = line[k], b = line[k + 1], c = line[k + 2];
        const va = values[a], vb = values[b], vc = values[c];
        if (va && vb && vc && 2 * vb !== va + vc) {
          ctx.conflicts.add(a); ctx.conflicts.add(b); ctx.conflicts.add(c);
        }
      }
    }
  },

  solverInit(p, ctx) {
    const list = p.sequenceLines || [];
    if (!list.length) return null;
    const N = ctx.N;
    /* Per cell: [ { li, pos } ]. */
    const lookup = Array.from({ length: ctx.total != null ? ctx.total : N * N }, () => []);
    list.forEach((line, li) => line.forEach((idx, pos) => lookup[idx].push({ li, pos })));
    return { list, lookup };
  },

  /* Given filled values on a line + a proposed (pos, v), decide feasibility. */
  _lineOK(line, grid, pos, v, N) {
    /* Collect all known (pos, value) pairs (including the proposed one). */
    const known = [];
    for (let k = 0; k < line.length; k++) {
      const kv = k === pos ? v : grid[line[k]];
      if (kv) known.push([k, kv]);
    }
    if (known.length < 2) return true;
    /* All pairs must share the same step. Use first two to determine it. */
    const [p0, v0] = known[0];
    const [p1, v1] = known[1];
    const dp = p1 - p0;
    if (dp === 0) return v0 === v1;
    if ((v1 - v0) % dp !== 0) return false;
    const step = (v1 - v0) / dp;
    for (const [pk, vk] of known) {
      const expected = v0 + step * (pk - p0);
      if (expected !== vk) return false;
      if (expected < 1 || expected > N) return false;
    }
    return true;
  },

  solverCheck(p, ctx, h, i, v) {
    for (const { li, pos } of h.lookup[i]) {
      if (!this._lineOK(h.list[li], ctx.grid, pos, v, ctx.N)) return false;
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const N = ctx.N, grid = ctx.grid;
    for (const { li, pos } of h.lookup[i]) {
      const line = h.list[li];
      /* Collect known cells other than i itself. */
      const known = [];
      for (let k = 0; k < line.length; k++) {
        if (k === pos) continue;
        const kv = grid[line[k]];
        if (kv) known.push([k, kv]);
      }
      if (known.length === 0) continue;
      if (known.length === 1) {
        /* One known value at pk with value vk. Only v that keeps (v - vk) /
           (pos - pk) an integer within valid step range is allowed. But we
           can't easily know the "correct" step, so leave general values
           alone here — solverCheck will catch inconsistencies. */
        continue;
      }
      /* At least two known: step is determined. Compute required v. */
      const [p0, v0] = known[0];
      const [p1, v1] = known[1];
      const dp = p1 - p0;
      if (dp === 0) {
        /* Two same-pos entries can't happen; skip. */
        continue;
      }
      if ((v1 - v0) % dp !== 0) {
        /* Line already infeasible — forbid everything to fail fast. */
        for (let x = 1; x <= N; x++) used |= ctx.bit(x);
        continue;
      }
      const step = (v1 - v0) / dp;
      const expected = v0 + step * (pos - p0);
      if (expected < 1 || expected > N) {
        for (let x = 1; x <= N; x++) used |= ctx.bit(x);
      } else {
        for (let x = 1; x <= N; x++) if (x !== expected) used |= ctx.bit(x);
      }
    }
    return used;
  },
});
