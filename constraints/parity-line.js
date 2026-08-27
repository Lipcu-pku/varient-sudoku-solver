/*
 * constraints/parity-line.js
 *
 * Parity lines: consecutive cells alternate odd / even. We track
 * per-cell neighbour lists (each pair from the line contributes both
 * directions) so any filled neighbour of the opposite parity is fine
 * and any same-parity neighbour rejects the placement.
 */
self.SudokuConstraints.register({
  id: 'parity-line',

  newFields(p)      { p.parityLines = []; },
  serialize(p)      { return { parityLines: p.parityLines || [] }; },
  deserialize(p, j) { p.parityLines = (j.parityLines || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.parityLines || [])) {
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1], b = line[k];
        const va = values[a], vb = values[b];
        if (!va || !vb) continue;
        if ((va & 1) === (vb & 1)) { ctx.conflicts.add(a); ctx.conflicts.add(b); }
      }
    }
  },

  solverInit(p, ctx) {
    const lines = p.parityLines || [];
    if (!lines.length) return null;
    const N = ctx.N;
    const nbrs = Array.from({ length: ctx.total != null ? ctx.total : N * N }, () => []);
    for (const line of lines) {
      for (let k = 1; k < line.length; k++) {
        nbrs[line[k-1]].push(line[k]);
        nbrs[line[k]].push(line[k-1]);
      }
    }
    /* Bit-masks of all odd digits and all even digits so `forbid` is O(1). */
    let oddMask = 0, evenMask = 0;
    for (let v = 1; v <= N; v++) {
      if (v & 1) oddMask |= 1 << (v - 1); else evenMask |= 1 << (v - 1);
    }
    return { nbrs, oddMask, evenMask };
  },

  solverCheck(p, ctx, h, i, v) {
    const par = v & 1;
    const grid = ctx.grid;
    for (const j of h.nbrs[i]) {
      const gv = grid[j];
      if (gv && (gv & 1) === par) return false;
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const grid = ctx.grid;
    for (const j of h.nbrs[i]) {
      const gv = grid[j]; if (!gv) continue;
      used |= (gv & 1) ? h.oddMask : h.evenMask;   /* forbid same parity */
    }
    return used;
  },
});
