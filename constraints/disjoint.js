/*
 * constraints/disjoint.js
 *
 * Disjoint groups: cells sharing the same (row, col) position within
 * their rectangular box together contain all N digits (no repeats).
 *
 * Only meaningful with regular A×B rectangular boxes — with jigsaw
 * regions, position-within-region isn't well defined, so the UI layer
 * mutually excludes jigsaw editing and this flag. The plugin itself
 * still checks against the current p.regions layout as long as every
 * region has exactly boxR × boxC cells arranged rectangularly.
 *
 * State model:
 *   p.flags.disjoint (Boolean)
 */
self.SudokuConstraints.register({
  id: 'disjoint',

  newFields(p) { if (p.flags && p.flags.disjoint == null) p.flags.disjoint = false; },
  serialize()  { return {}; },   /* Piggybacks on p.flags in core serialize */
  deserialize(){},

  findConflicts(p, ctx) {
    if (!p.flags || !p.flags.disjoint) return;
    const { N, boxR, boxC, values } = p;
    const nRows = p.rows != null ? p.rows : N;
    const nCols = p.cols != null ? p.cols : N;
    /* Only makes sense on a classic square grid with uniform rectangular
       boxes and no holes; otherwise skip entirely. */
    if (nRows !== nCols || nRows !== N) return;
    if (p.deleted) { for (let k = 0; k < p.deleted.length; k++) if (p.deleted[k]) return; }
    const groups = Array.from({ length: boxR * boxC }, () => []);
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      groups[(r % boxR) * boxC + (c % boxC)].push(i);
    }
    for (const g of groups) {
      const seen = new Map();
      for (const i of g) {
        const v = values[i]; if (!v) continue;
        if (seen.has(v)) { ctx.conflicts.add(seen.get(v)); ctx.conflicts.add(i); }
        else seen.set(v, i);
      }
    }
  },

  solverInit(p, ctx) {
    if (!p.flags || !p.flags.disjoint) return null;
    const N = ctx.N, boxR = p.boxR, boxC = p.boxC;
    const nRows = ctx.rows != null ? ctx.rows : N;
    const nCols = ctx.cols != null ? ctx.cols : N;
    if (nRows !== nCols || nRows !== N) return null;
    if (ctx.deleted) { for (let k = 0; k < ctx.deleted.length; k++) if (ctx.deleted[k]) return null; }
    const total = N * N;
    const groupOf = new Int32Array(total);
    for (let i = 0; i < total; i++) {
      const r = (i / N) | 0, c = i % N;
      groupOf[i] = (r % boxR) * boxC + (c % boxC);
    }
    return { groupOf, mask: new Int32Array(boxR * boxC) };
  },

  solverCheck(p, ctx, h, i, v)    { return !(h.mask[h.groupOf[i]] & ctx.bit(v)); },
  solverCommit(p, ctx, h, i, v)   { h.mask[h.groupOf[i]] |= ctx.bit(v); },
  solverUnplace(p, ctx, h, i, v)  { h.mask[h.groupOf[i]] &= ~ctx.bit(v); },
  solverForbid(p, ctx, h, i, used){ return used | h.mask[h.groupOf[i]]; },
});
