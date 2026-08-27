/*
 * constraints/between.js
 *
 * Between lines: a line with two circled ends (a, b) and middle cells
 * m1..mk. Every middle digit must lie strictly between a and b:
 *     min(a,b) < mi < max(a,b)   for each i.
 *
 * A between line needs length >= 3 to have any middles. The endpoints
 * themselves are not required to differ by anything specific; if a and
 * b are too close (|a-b| < 2), no middle can satisfy the strict-between
 * rule and the line becomes unsatisfiable.
 *
 * State model:
 *   p.betweenLines = [ [idxA, ...middles, idxB], ... ]
 */
self.SudokuConstraints.register({
  id: 'between',

  newFields(p)      { p.betweenLines = []; },
  serialize(p)      { return { betweenLines: p.betweenLines || [] }; },
  deserialize(p, j) { p.betweenLines = (j.betweenLines || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.betweenLines || [])) {
      if (line.length < 2) continue;
      const a = line[0], b = line[line.length - 1];
      const va = values[a], vb = values[b];
      if (va && vb) {
        const lo = Math.min(va, vb), hi = Math.max(va, vb);
        for (let k = 1; k < line.length - 1; k++) {
          const m = line[k], vm = values[m];
          if (vm && !(vm > lo && vm < hi)) {
            ctx.conflicts.add(a); ctx.conflicts.add(b); ctx.conflicts.add(m);
          }
        }
      }
      /* If endpoints exist and are equal, the line is unsatisfiable. */
      if (va && vb && va === vb && line.length > 2) {
        ctx.conflicts.add(a); ctx.conflicts.add(b);
      }
    }
  },

  solverInit(p, ctx) {
    const list = p.betweenLines || [];
    if (!list.length) return null;
    const N = ctx.N;
    /* For each cell store [{ lineIdx, role, k }], where role is 'a', 'b', 'm'. */
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
      /* Middle constraint depends on both endpoints being known — otherwise
         we can't prune here (deferred until the endpoint is placed). */
      if (ref.role === 'm') {
        if (va && vb) {
          const lo = Math.min(va, vb), hi = Math.max(va, vb);
          if (!(v > lo && v < hi)) return false;
        }
      } else {
        /* Endpoint placement: check against any already-filled middles + the
           other endpoint if present. */
        if (va && vb) {
          if (va === vb && line.length > 2) return false;
          const lo = Math.min(va, vb), hi = Math.max(va, vb);
          for (let k = 1; k < line.length - 1; k++) {
            const mv = grid[line[k]];
            if (mv && !(mv > lo && mv < hi)) return false;
          }
        } else {
          /* Only one endpoint known so far: middles must still be reachable
             (skipped — reject only on completed pairs). */
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
          for (let v = 1; v <= lo; v++) used |= ctx.bit(v);
          for (let v = hi; v <= N; v++) used |= ctx.bit(v);
        }
      } else {
        /* For endpoints, forbid values that would break any already-filled
           middle. Also forbid == the other endpoint when middles exist. */
        for (let k = 1; k < line.length - 1; k++) {
          const mv = grid[line[k]];
          if (!mv) continue;
          /* If this endpoint is v and the other is vOther, we need
             min(v,vOther) < mv < max(v,vOther). If the other endpoint is
             already known, prune directly. */
          if (ref.role === 'a' && vb) {
            for (let v = 1; v <= N; v++) {
              const lo = Math.min(v, vb), hi = Math.max(v, vb);
              if (!(mv > lo && mv < hi)) used |= ctx.bit(v);
            }
          } else if (ref.role === 'b' && va) {
            for (let v = 1; v <= N; v++) {
              const lo = Math.min(va, v), hi = Math.max(va, v);
              if (!(mv > lo && mv < hi)) used |= ctx.bit(v);
            }
          } else {
            /* Only middles known: v must satisfy mv strictly between v and
               *something*; a very loose bound is v != mv (endpoints must
               differ from any middle). */
            used |= ctx.bit(mv);
          }
        }
        if (line.length > 2) {
          /* Endpoints must differ (otherwise no middle can satisfy the strict
             between rule). */
          if (ref.role === 'a' && vb) used |= ctx.bit(vb);
          if (ref.role === 'b' && va) used |= ctx.bit(va);
        }
      }
    }
    return used;
  },
});
