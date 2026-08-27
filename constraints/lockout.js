/*
 * constraints/lockout.js
 *
 * Lockout lines: a line with two diamond ends (a, b) and middle cells
 * m1..mk. The endpoints must differ by at least 4 (so a range of
 * "forbidden" middle values exists), and every middle digit must lie
 * STRICTLY OUTSIDE the closed interval [min(a,b), max(a,b)]:
 *     mi < min(a,b) OR mi > max(a,b)
 *
 * Length must be >= 3 for middles to exist. In smaller-N variants a
 * gap of 4 may be tight — the constraint is still well-defined; puzzles
 * that can't satisfy it simply have no solution.
 *
 * State model:
 *   p.lockoutLines = [ [idxA, ...middles, idxB], ... ]
 */
self.SudokuConstraints.register({
  id: 'lockout',

  newFields(p)      { p.lockoutLines = []; },
  serialize(p)      { return { lockoutLines: p.lockoutLines || [] }; },
  deserialize(p, j) { p.lockoutLines = (j.lockoutLines || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.lockoutLines || [])) {
      if (line.length < 2) continue;
      const a = line[0], b = line[line.length - 1];
      const va = values[a], vb = values[b];
      if (va && vb) {
        if (Math.abs(va - vb) < 4 && line.length > 2) {
          ctx.conflicts.add(a); ctx.conflicts.add(b);
        }
        const lo = Math.min(va, vb), hi = Math.max(va, vb);
        for (let k = 1; k < line.length - 1; k++) {
          const m = line[k], vm = values[m];
          if (vm && (vm >= lo && vm <= hi)) {
            ctx.conflicts.add(a); ctx.conflicts.add(b); ctx.conflicts.add(m);
          }
        }
      }
    }
  },

  solverInit(p, ctx) {
    const list = p.lockoutLines || [];
    if (!list.length) return null;
    const N = ctx.N;
    const lookup = Array.from({ length: N * N }, () => []);
    list.forEach((line, li) => {
      if (line.length < 2) return;
      lookup[line[0]].push({ li, role: 'a' });
      lookup[line[line.length - 1]].push({ li, role: 'b' });
      for (let k = 1; k < line.length - 1; k++) {
        lookup[line[k]].push({ li, role: 'm' });
      }
    });
    return { list, lookup };
  },

  solverCheck(p, ctx, h, i, v) {
    const grid = ctx.grid;
    for (const ref of h.lookup[i]) {
      const line = h.list[ref.li];
      const a = line[0], b = line[line.length - 1];
      const va = ref.role === 'a' ? v : grid[a];
      const vb = ref.role === 'b' ? v : grid[b];
      if (ref.role === 'm') {
        if (va && vb) {
          const lo = Math.min(va, vb), hi = Math.max(va, vb);
          if (v >= lo && v <= hi) return false;
        }
      } else {
        if (va && vb) {
          if (line.length > 2 && Math.abs(va - vb) < 4) return false;
          const lo = Math.min(va, vb), hi = Math.max(va, vb);
          for (let k = 1; k < line.length - 1; k++) {
            const mv = grid[line[k]];
            if (mv && (mv >= lo && mv <= hi)) return false;
          }
        }
      }
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const grid = ctx.grid;
    const N = ctx.N;
    for (const ref of h.lookup[i]) {
      const line = h.list[ref.li];
      const a = line[0], b = line[line.length - 1];
      const va = grid[a], vb = grid[b];
      if (ref.role === 'm') {
        if (va && vb) {
          const lo = Math.min(va, vb), hi = Math.max(va, vb);
          for (let v = lo; v <= hi; v++) used |= ctx.bit(v);
        }
      } else {
        for (let k = 1; k < line.length - 1; k++) {
          const mv = grid[line[k]];
          if (!mv) continue;
          if (ref.role === 'a' && vb) {
            for (let v = 1; v <= N; v++) {
              const lo = Math.min(v, vb), hi = Math.max(v, vb);
              if (mv >= lo && mv <= hi) used |= ctx.bit(v);
            }
          } else if (ref.role === 'b' && va) {
            for (let v = 1; v <= N; v++) {
              const lo = Math.min(va, v), hi = Math.max(va, v);
              if (mv >= lo && mv <= hi) used |= ctx.bit(v);
            }
          }
        }
        /* If both endpoints will be filled and line has middles, we need a
           gap of at least 4. Only prune when the other endpoint is known. */
        if (line.length > 2) {
          if (ref.role === 'a' && vb) {
            for (let v = 1; v <= N; v++) if (Math.abs(v - vb) < 4) used |= ctx.bit(v);
          } else if (ref.role === 'b' && va) {
            for (let v = 1; v <= N; v++) if (Math.abs(va - v) < 4) used |= ctx.bit(v);
          }
        }
      }
    }
    return used;
  },
});
