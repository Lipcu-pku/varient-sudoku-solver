/*
 * constraints/palindrome.js
 *
 * Palindrome lines: digits read the same forwards and backwards. For each
 * line, we build the mirror pairs (k, length-1-k). During solve, if either
 * end of a pair is filled and disagrees with a proposed value at the other
 * end, we reject.
 */
self.SudokuConstraints.register({
  id: 'palindrome',

  newFields(p)      { p.palindromes = []; },
  serialize(p)      { return { palindromes: p.palindromes || [] }; },
  deserialize(p, j) { p.palindromes = (j.palindromes || []).map(l => [...l]); },

  findConflicts(p, ctx) {
    const values = p.values;
    for (const line of (p.palindromes || [])) {
      const len = line.length;
      for (let k = 0; k < (len >> 1); k++) {
        const a = line[k], b = line[len - 1 - k];
        const va = values[a], vb = values[b];
        if (va && vb && va !== vb) { ctx.conflicts.add(a); ctx.conflicts.add(b); }
      }
    }
  },

  solverInit(p, ctx) {
    const lines = p.palindromes || [];
    if (!lines.length) return null;
    const N = ctx.N;
    const mirror = Array.from({ length: N * N }, () => []);
    for (const line of lines) {
      const len = line.length;
      for (let k = 0; k < (len >> 1); k++) {
        const a = line[k], b = line[len - 1 - k];
        if (a === b) continue;
        mirror[a].push(b);
        mirror[b].push(a);
      }
    }
    return { mirror };
  },

  solverCheck(p, ctx, h, i, v) {
    const grid = ctx.grid;
    for (const j of h.mirror[i]) {
      const gv = grid[j];
      if (gv && gv !== v) return false;
    }
    return true;
  },

  solverCommit()  {},
  solverUnplace() {},

  solverForbid(p, ctx, h, i, used) {
    const grid = ctx.grid;
    const full = ctx.full;
    for (const j of h.mirror[i]) {
      const gv = grid[j];
      if (gv) used |= (~ctx.bit(gv)) & full;
    }
    return used;
  },
});
