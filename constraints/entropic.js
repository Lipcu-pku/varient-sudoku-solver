/*
 * constraints/entropic.js
 *
 * Entropic lines: every 3 consecutive cells must together cover the three
 * "bands" — Low (1..t), Mid (t+1..2t), High (2t+1..N) where t = ⌈N/3⌉.
 * Precomputes the 3-cell trios each cell belongs to plus a per-band mask
 * so `check` and `forbid` are branchless bitwise ops.
 */
self.SudokuConstraints.register({
  id: 'entropic',

  newFields(p)      { p.entropics = []; },
  serialize(p)      { return { entropics: p.entropics || [] }; },
  deserialize(p, j) { p.entropics = (j.entropics || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    const N = p.N;
    const tercile = Math.ceil(N / 3);
    const band = v => v <= tercile ? 0 : v <= 2 * tercile ? 1 : 2;
    for (const line of (p.entropics || [])) {
      for (let k = 0; k + 2 < line.length; k++) {
        const a = line[k], b = line[k+1], c = line[k+2];
        const va = values[a], vb = values[b], vc = values[c];
        if (!va || !vb || !vc) continue;
        const ba = band(va), bb = band(vb), bc = band(vc);
        if (ba === bb) { ctx.conflicts.add(a); ctx.conflicts.add(b); }
        if (bb === bc) { ctx.conflicts.add(b); ctx.conflicts.add(c); }
        if (ba === bc) { ctx.conflicts.add(a); ctx.conflicts.add(c); }
      }
    }
  },

  solverInit(p, ctx) {
    const lines = p.entropics || [];
    if (!lines.length) return null;
    const N = ctx.N;
    const tercile = Math.ceil(N / 3);
    const band = v => v <= tercile ? 0 : v <= 2 * tercile ? 1 : 2;
    const bandMasks = [0, 0, 0];
    for (let v = 1; v <= N; v++) bandMasks[band(v)] |= 1 << (v - 1);
    const trios = Array.from({ length: ctx.total != null ? ctx.total : N * N }, () => []);
    for (const line of lines) {
      for (let k = 0; k + 2 < line.length; k++) {
        const trio = [line[k], line[k+1], line[k+2]];
        for (const c of trio) trios[c].push(trio);
      }
    }
    return { band, bandMasks, trios };
  },

  solverCheck(p, ctx, h, i, v) {
    const b = h.band(v);
    const grid = ctx.grid;
    for (const trio of h.trios[i]) {
      for (const o of trio) {
        if (o === i) continue;
        const gv = grid[o];
        if (gv && h.band(gv) === b) return false;
      }
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const grid = ctx.grid;
    for (const trio of h.trios[i]) {
      let banned = 0;
      for (const o of trio) {
        if (o === i) continue;
        const gv = grid[o]; if (!gv) continue;
        banned |= h.bandMasks[h.band(gv)];
      }
      used |= banned;
    }
    return used;
  },
});
