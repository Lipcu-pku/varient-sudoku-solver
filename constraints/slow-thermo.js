/*
 * constraints/slow-thermo.js
 *
 * Slow thermometer: along the path, digits are non-strictly increasing
 * (a[k] <= a[k+1]) — repeats allowed. Same UI as thermo (first cell is
 * the bulb, drag to draw), only the solver relation weakens from < to <=.
 *
 * State model:
 *   p.slowThermos = [[idx0, idx1, ...], ...]   // bulb first
 */
self.SudokuConstraints.register({
  id: 'slow-thermo',

  newFields(p)      { p.slowThermos = []; },
  serialize(p)      { return { slowThermos: p.slowThermos || [] }; },
  deserialize(p, j) { p.slowThermos = (j.slowThermos || []).map(t => [...t]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const t of (p.slowThermos || [])) {
      let prev = 0, prevIdx = -1;
      for (const i of t) {
        const v = values[i];
        if (!v) { prev = 0; prevIdx = -1; continue; }
        if (prev && v < prev) { ctx.conflicts.add(prevIdx); ctx.conflicts.add(i); }
        prev = v; prevIdx = i;
      }
    }
  },

  solverInit(p, ctx) {
    const list = p.slowThermos || [];
    if (!list.length) return null;
    const N = ctx.N;
    const lookup = Array.from({ length: ctx.total != null ? ctx.total : N * N }, () => []);
    list.forEach((t, ti) => t.forEach((i, pos) => lookup[i].push([ti, pos])));
    const vals = list.map(t => new Uint8Array(t.length));
    return { list, lookup, vals };
  },

  solverCheck(p, ctx, h, i, v) {
    for (const [ti, pos] of h.lookup[i]) {
      const arr = h.vals[ti];
      const before = pos > 0 ? arr[pos - 1] : 0;
      const after  = pos < h.list[ti].length - 1 ? arr[pos + 1] : 0;
      if (before && v < before) return false;
      if (after  && v > after)  return false;
    }
    return true;
  },

  solverCommit(p, ctx, h, i, v)  { for (const [ti, pos] of h.lookup[i]) h.vals[ti][pos] = v; },
  solverUnplace(p, ctx, h, i, v) { for (const [ti, pos] of h.lookup[i]) h.vals[ti][pos] = 0; },

  solverForbid(p, ctx, h, i, used) {
    const N = ctx.N;
    for (const [ti, pos] of h.lookup[i]) {
      const t = h.list[ti], arr = h.vals[ti];
      /* min propagates from left (each earlier known value bounds v from below;
         and each step allows repeat, so no extra +1). */
      let minV = 1, maxV = N;
      for (let k = pos - 1; k >= 0; k--) if (arr[k]) { minV = Math.max(minV, arr[k]); break; }
      for (let k = pos + 1; k < t.length; k++) if (arr[k]) { maxV = Math.min(maxV, arr[k]); break; }
      for (let v = 1; v < minV; v++) used |= ctx.bit(v);
      for (let v = maxV + 1; v <= N; v++) used |= ctx.bit(v);
    }
    return used;
  },
});
