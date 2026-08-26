/*
 * constraints/quadruple.js
 *
 * Quadruples: at an intersection (r, c) between four cells, every listed
 * digit must appear in at least one of those four cells. Enforcement only
 * kicks in once all four cells are filled — before that the constraint
 * is satisfiable in principle.
 */
self.SudokuConstraints.register({
  id: 'quadruple',

  newFields(p)      { p.quadruples = []; },
  serialize(p)      { return { quadruples: p.quadruples || [] }; },
  deserialize(p, j) {
    p.quadruples = (j.quadruples || []).map(q => ({
      r: q.r, c: q.c, digits: [...(q.digits || [])],
    }));
  },

  findConflicts(p, ctx) {
    const values = p.values;
    const N = p.N;
    for (const q of (p.quadruples || [])) {
      const r = q.r, c = q.c;
      if (r <= 0 || r >= N || c <= 0 || c >= N) continue;
      const cells = [
        (r - 1) * N + (c - 1),
        (r - 1) * N + c,
        r * N + (c - 1),
        r * N + c,
      ];
      if (!cells.every(i => values[i])) continue;
      const present = new Set(cells.map(i => values[i]));
      for (const d of q.digits) {
        if (!present.has(d)) { cells.forEach(i => ctx.conflicts.add(i)); break; }
      }
    }
  },

  solverInit(p, ctx) {
    const quads = p.quadruples || [];
    if (!quads.length) return null;
    const N = ctx.N;
    const quadOf = Array.from({ length: N * N }, () => []);
    quads.forEach(q => {
      const r = q.r, c = q.c;
      if (r <= 0 || r >= N || c <= 0 || c >= N) return;
      const cells = [(r-1)*N+(c-1), (r-1)*N+c, r*N+(c-1), r*N+c];
      cells.forEach(cell => quadOf[cell].push({ q, cells }));
    });
    return { quadOf };
  },

  solverCheck(p, ctx, h, i, v) {
    const grid = ctx.grid;
    for (const { q, cells } of h.quadOf[i]) {
      let allFilled = true;
      const present = new Set();
      for (const cell of cells) {
        if (cell === i) present.add(v);
        else if (grid[cell]) present.add(grid[cell]);
        else { allFilled = false; break; }
      }
      if (allFilled) {
        for (const d of q.digits) if (!present.has(d)) return false;
      }
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},
  /* No cheap `forbid` pruning: the constraint's implication only fires when
     the 2×2 is nearly complete, and solverCheck already covers that case. */
});
